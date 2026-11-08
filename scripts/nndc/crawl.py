# Crawl www.nndc.bnl.gov: every static HTML page on the host and every file link it carries. Query-string URLs
# (the search apps) are recorded, not followed. Run in a work directory that holds sitemap.txt
# (https://www.nndc.bnl.gov/sitemap.txt) or a seeds file:
#   python3 -I scripts/nndc/crawl.py <workdir> [seeds-file] [prefix] [max-pages]
# Writes <prefix>pages.jsonl, <prefix>files.jsonl, <prefix>apps.txt. Two passes cover the site (2026-11-07):
# the sitemap, then the ENDF library resource pages (ACE, POINT, GNDS, processing, …) that the ENDF releases
# app links only from JavaScript (scripts/nndc/list.py writes those seeds to seeds2.txt).
import json, os, re, sys, time, html, urllib.request, urllib.parse
from collections import deque

os.chdir(sys.argv[1])
SEEDS = sys.argv[2] if len(sys.argv) > 2 else "sitemap.txt"
PREFIX = sys.argv[3] if len(sys.argv) > 3 else ""
MAX_PAGES = int(sys.argv[4]) if len(sys.argv) > 4 else 8000
HOST = "www.nndc.bnl.gov"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
DELAY = 0.3

seeds = ["https://www.nndc.bnl.gov/"] + [l.strip() for l in open(SEEDS) if l.strip()]
seen, q = set(), deque()
for s in seeds:
    if s not in seen:
        seen.add(s); q.append(s)
files, apps = {}, set()
pages = open(PREFIX + "pages.jsonl", "w")


def is_page(path):
    last = path.rsplit("/", 1)[-1]
    return "." not in last or last.lower().endswith((".html", ".htm", ".jsp", ".php"))


n = 0
while q and n < MAX_PAGES:
    url = q.popleft()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            ctype = r.headers.get("Content-Type", "")
            final = r.geturl()
            if "html" not in ctype:
                files[url] = {"url": url, "ctype": ctype, "size": r.headers.get("Content-Length"), "from": "page-probe"}
                continue
            body = r.read().decode("utf-8", "replace")
    except Exception as e:
        pages.write(json.dumps({"url": url, "error": str(e)[:200]}) + "\n"); n += 1
        continue
    n += 1
    title = re.search(r"<title>(.*?)</title>", body, re.S | re.I)
    links = re.findall(r"""(?:href|src)\s*=\s*["']([^"'#]+)""", body, re.I)
    out = 0
    for h in links:
        h = html.unescape(h.strip())
        if h.startswith(("mailto:", "javascript:", "tel:")):
            continue
        u = urllib.parse.urljoin(final, h)
        p = urllib.parse.urlparse(u)
        out += 1
        if p.netloc != HOST:
            continue
        u = p._replace(fragment="").geturl()
        if p.query:
            apps.add(u.split("?")[0] + "?…"); continue
        if is_page(p.path):
            if u not in seen and not re.search(r"/common/|/styles/|/scripts/", p.path):
                seen.add(u); q.append(u)
        elif not re.search(r"\.(css|js|svg|ico|png|jpe?g|gif|woff2?|ttf|map)$", p.path, re.I):
            files.setdefault(u, {"url": u, "from": url})
    pages.write(json.dumps({"url": url, "final": final, "title": (html.unescape(title.group(1)).strip() if title else ""), "links": out}) + "\n")
    pages.flush()
    if n % 100 == 0:
        print(f"{n} pages, {len(q)} queued, {len(files)} files", flush=True)
    time.sleep(DELAY)

with open(PREFIX + "files.jsonl", "w") as f:
    for v in files.values():
        f.write(json.dumps(v) + "\n")
open(PREFIX + "apps.txt", "w").write("\n".join(sorted(apps)) + "\n")
print(f"done: {n} pages, {len(q)} left in queue, {len(files)} files, {len(apps)} app endpoints", flush=True)
