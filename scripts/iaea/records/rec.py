# Shared pieces for the IAEA records pass (brief 20), imported by index.py, cdx.py, classify.py, wayback.py, proxy.py
# and manifest.py: the lake prefix, S3 helpers, the proxy meter's running total, and a real Chrome on one Webshare line
# that has cleared nds.iaea.org's Cloudflare challenge (launch, clearing and in-page fetch copied from
# scripts/iaea/box/mirror.py, adapted).
import base64, hashlib, json, os, re, time
import boto3

B = "nsr-lake-613473203863"
P = "raw/iaea-records/2026-11-08"
W = f"{P}/_work"
CAP = 5_000_000_000  # brief 20: 5.0 GB of proxy bytes, counted by meter.sh
METER = "/opt/box/meter.json"
s3 = boto3.client("s3", region_name="us-east-2")


def get(key):
    return s3.get_object(Bucket=B, Key=key)["Body"].read()


def get_json(key):
    return json.loads(get(key))


def put(key, body, ct="application/octet-stream"):
    s3.put_object(Bucket=B, Key=key, Body=body, ContentType=ct)


def put_json(key, obj):
    put(key, json.dumps(obj, indent=1, ensure_ascii=False).encode(), "application/json")


def put_lines(key, rows):
    put(key, "\n".join(json.dumps(r, ensure_ascii=False) for r in rows).encode(), "application/x-ndjson")


def have(key):
    try:
        return s3.head_object(Bucket=B, Key=key)["ContentLength"]
    except Exception:
        return None


def metered():
    # proxy bytes so far on this box (both directions, every packet), from meter.sh's local file; None if not running
    try:
        return json.load(open(METER))["total"]
    except Exception:
        return None


def metered_at():
    # (total, the time meter.sh wrote it) or (None, None)
    try:
        return json.load(open(METER))["total"], os.path.getmtime(METER)
    except Exception:
        return None, None


def proxy_lines():
    return [l.split(":") for l in boto3.client("ssm", region_name="us-east-2").get_parameter(
        Name="/nsrgpt/webshare/proxies", WithDecryption=True)["Parameter"]["Value"].splitlines() if l.strip()]


def md5_file(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


_CH = re.compile(rb"<title>Just a moment|cf-chl-widget|id=\"challenge-form|<title>Checking your browser", re.I)

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


class Browser:
    # One Chrome (headful under Xvfb, automation flags off) through one proxy line. The warm page is /records/, a short
    # "Page not found" page: the first navigation passes, the first API fetch is challenged, and going back to the warm
    # page then shows the challenge, which clears and sets cf_clearance; fetches pass after that (tested 2026-11-08). Requests go one at a time with
    # at least GAP seconds between them (brief 20: one browser, one request at a time against nds.iaea.org).
    GAP = 0.5

    def __init__(self, line_numbers, warm="https://nds.iaea.org/records/", log=print):
        from playwright.sync_api import sync_playwright
        self.pw = sync_playwright().start()
        self.warm, self.log, self.last = warm, log, 0.0
        lines = proxy_lines()
        for n in line_numbers:
            ip, port, user, pw = lines[n][:4]
            br = self.pw.chromium.launch(channel="chrome", headless=False,
                                         proxy={"server": f"http://{ip}:{port}", "username": user, "password": pw},
                                         args=["--no-first-run", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
                                         ignore_default_args=["--enable-automation"], downloads_path="/data")
            ctx = br.new_context(accept_downloads=True, viewport={"width": 1280, "height": 900}, locale="en-US")
            ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            # images and fonts are never needed here; skip them to save proxy bytes
            ctx.route(re.compile(r"\.(png|jpe?g|gif|svg|ico|woff2?|ttf|eot)(\?|$)", re.I), lambda r: r.abort())
            page = ctx.new_page()
            try:
                page.goto(warm, timeout=90000, wait_until="domcontentloaded")
            except Exception as e:
                log(f"line {n}: warm failed: {str(e)[:120]}")
            if self.cleared(page):
                self.line, self.br, self.ctx, self.page = n, br, ctx, page
                log(f"line {n}: cleared")
                return
            log(f"line {n}: challenge did not clear")
            br.close()
        raise RuntimeError("no line cleared the challenge")

    @staticmethod
    def cleared(page, secs=90):
        t0 = time.time()
        while time.time() - t0 < secs:
            try:
                if not _CH.search(page.content().encode()) and "moment" not in page.title().lower():
                    return True
            except Exception:
                pass
            time.sleep(2)
        return False

    def wait(self):
        time.sleep(max(0, self.last + self.GAP - time.time()))
        self.last = time.time()

    def rewarm(self):
        self.wait()
        try:
            self.page.goto(self.warm, timeout=90000, wait_until="domcontentloaded")
        except Exception:
            pass
        self.cleared(self.page, 60)

    def get(self, url):
        # {status, ct, url, body} for responses up to 10 MB (in-page fetch); bigger ones arrive as a browser download:
        # {status, ct, url, path}. A challenge answer (403/503 or the challenge page) gets one re-warm and one retry.
        for attempt in range(2):
            self.wait()
            try:
                r = self.page.evaluate(FETCH_JS, url)
            except Exception as e:
                if "Failed to fetch" not in str(e):
                    raise
                return self.download(url)  # a redirect the page can't read: let Chrome download it
            if r.get("big"):
                return self.download(url, r)
            body = base64.b64decode(r.get("b64") or "")
            chal = r["status"] in (403, 503) and ("html" in r["ct"] and _CH.search(body[:20000]) or not body)
            if chal and attempt == 0:
                self.log(f"challenged on {url}; re-warming")
                self.rewarm()
                continue
            return {"status": r["status"], "ct": r["ct"], "url": r["url"], "body": body}

    def download(self, url, r=None):
        self.wait()
        with self.page.expect_download(timeout=3600000) as d:
            self.page.evaluate(CLICK_JS, url)
        dl = d.value
        if dl.failure():
            raise IOError(f"download failed: {dl.failure()}")
        return {"status": (r or {}).get("status", 200), "ct": (r or {}).get("ct", ""), "url": dl.url, "path": str(dl.path())}

    def close(self):
        try:
            self.br.close()
        finally:
            self.pw.stop()


# ---------------------------------------------------------------- brief 20's file classes (classify.py, manifest.py)
DXS = "dgy96-g7a65"  # DXS-2026
PAPER = set("pdf doc docx ppt pptx xls xlsx csv txt md rtf odt odp html htm".split())
IMAGE = set("jpg jpeg png gif tif tiff heic bmp webp svg".split())
VIDEO = set("mp4 mov avi mkv webm wmv m4v mpg mpeg".split())
LIMIT = 100_000_000  # paperwork is under 100 MB


def ext_of(name, e=None):
    return (e or os.path.splitext(name)[1].lstrip(".")).lower()


def klass(ext, size):
    # paperwork when the extension is one of PAPER and the file is under 100 MB; images and video are skipped; the
    # rest is data
    if ext in IMAGE:
        return "image"
    if ext in VIDEO:
        return "video"
    if ext in PAPER and size < LIMIT:
        return "paperwork"
    return "data"


def live_url(rid, name):
    import urllib.parse
    return f"https://nds.iaea.org/records/{rid}/files/{urllib.parse.quote(name)}?download=1"
