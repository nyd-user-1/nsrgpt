"""JANIS Web's browse tree, crawled whole (brief 68), and its book pages (brief 75). Runs on a box (python3 with boto3),
never on the Mac.

  python3 crawl.py [--hours 20] [--max-depth 4]          the tree, rebuilt from the page cache (fetching what is missing)
  python3 crawl.py --mode plan                           lake/_work/janis/todo/elements.json: the element pages not cached
  python3 crawl.py --mode fetch --shard 0/4 --ramp       fetch this box's share of the to-do pages into the cache
  python3 crawl.py --mode books --shard 0/4 --ramp       every book page and its saved state into lake/_work/janis/book/
  python3 crawl.py --mode reference                      lake/janis/reference/<book>.json from the cached book pages
  python3 crawl.py --mode tabler --shard 0/2             JANIS's Tabler CSV for the sample pages (lake/janis/reference/tabler/)

https://www.oecd-nea.org/janisweb/tree is server-rendered: each page is a breadcrumb and a list of rows
(<li class="list-group-item">), each row a link one level down; a row with an Open button carries a renderer id
(data-renderer="/janisweb/renderer?root=~N~JEFF-3.3~SIG~Ni56~MT2") and is a leaf. The levels: Base (0) → category (1) →
library (2) → data type (3) → element (4) → isotope (5) → the leaf rows on the isotope page. Labels are kept verbatim.

Every fetched tree page is cached under s3://nsr-lake-613473203863/lake/_work/janis/pages/<path>.html, so a rerun reads
the cache and fetches only what is new; the cache is the only checkpoint (doctrine rule 4). The tree is written to
lake/janis/2026-11-10/tree-raw.json, with progress.json beside it; mark.py marks it (see README.md).

Rate (brief 75, doctrine rule 2): one Limiter per box, that is per IP. Without --ramp it is one request a second, as
brief 68 ran. With --ramp it starts at one a second and adds --step every --every seconds until the first refusal (HTTP
429, 403, 502-504 or Cloudflare's 520-527, a challenge page, a refused or reset connection); the rate then is this IP's
ceiling (for book pages, the origin's: each session holds a renderer on JANIS's server, so keep --workers small), and
the box holds at --hold times it, pausing a minute and stepping down again at every further refusal. The ceiling and
every refusal are written to the shard's progress file. Worker threads (--workers) only wait on the limiter.

Book pages (brief 75 C3): /janisweb/book/<book>/<mat>/<reac> (the page list is lake/elpis/2026-11-11/janis-rail-<book>.jsonl)
needs the session cookie JANIS's home page sets (brief 72 trap 7b), so each worker thread keeps its own session. The page
redirects to <page>/renderer/<id>; the HTML embeds the left rail (bookPageOutline), the bottom sheet (selectionTreeRows)
and the plot's card (displayedTabs: tab title, axis variable, scale types and ranges, the series drawn); <final
URL>/saveState.xml is JANIS's saved-state file for the plot (each series' legend title, colour and symbol or line,
the chart title and axis label settings). Both are kept as fetched; --mode reference reads them.

Tabler (C4): on a book page's renderer, toogleProducer.json with producerId janis-render-T-<series ref> opens the Tabler
for that series (viewer t<n>), and <final URL>/tabler/<viewer>/csv is the whole table in one request (the download
JANIS's Tabler offers), so computed series (calc[...]) come from the page that draws them.
"""
import argparse
import concurrent.futures as cf
import hashlib
import heapq
import html
import http.cookiejar
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

import boto3

BUCKET, REGION = "nsr-lake-613473203863", "us-east-2"
SITE, ROOT = "https://www.oecd-nea.org", "/janisweb/tree"
CACHE, OUT = "lake/_work/janis/pages", "lake/janis/2026-11-10"
TODO = "lake/_work/janis/todo/elements.json"
BOOKCACHE, RAILS = "lake/_work/janis/book", "lake/elpis/2026-11-11"
REF = "lake/janis/reference"
BOOKS = ["neutrons", "gammas", "protons", "deuterons", "tritons", "he3", "alphas"]
UA = "Mozilla/5.0 (compatible; NSRgpt-crawler/1.1; nsrgpt.com)"
ROW = re.compile(r'<li class="list-group-item[^"]*"[^>]*>(.*?)</li>', re.S)
LINK = re.compile(r'<a href="(/janisweb/tree[^"]*)"[^>]*>([^<]*)</a>')
RENDERER = re.compile(r'data-renderer="([^"]*)"')
# JANIS library rows the lake holds (brief 68's rule): the releases in nsr.endfb_materials, EXFOR, CINDA and the 2020
# masses; their pages go first in the element and isotope phases.
HELD_LIBS = {"EXFOR", "CINDA", "ENDF/B-VI.8", "ENDF/B-VII.0", "ENDF/B-VII.1", "ENDF/B-VIII.0", "JEFF-3.3", "CENDL-3.2",
             "Nubase 2020", "NUBASE2020"}

s3 = boto3.client("s3", region_name=REGION)
stats = {"fetched": 0, "cached": 0, "failed": 0, "by_depth": {}}
failures = []
_lock = threading.Lock()


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class Refused(Exception):
    pass


class Limiter:
    """Requests a second for this box (one IP); see the module docstring."""

    def __init__(self, rate=1.0, ramp=False, step=1.0, every=30.0, cap=64.0, hold=0.8):
        self.rate, self.ramp, self.step, self.every, self.cap, self.hold = rate, ramp, step, every, cap, hold
        self.lock = threading.Lock()
        self.next = self.t_step = time.time()
        self.ceiling, self.refusals, self.requests = None, [], 0
        self.history = [{"at": now(), "rate": rate}]

    def wait(self):
        with self.lock:
            t = time.time()
            if self.ramp and self.ceiling is None and t - self.t_step >= self.every and self.rate < self.cap:
                self.rate = min(self.cap, self.rate + self.step)
                self.t_step = t
                self.history.append({"at": now(), "rate": self.rate, "requests": self.requests})
            slot = max(self.next, t)
            self.next = slot + 1.0 / self.rate
            self.requests += 1
        if slot > time.time():
            time.sleep(slot - time.time())

    def refused(self, why, url):
        with self.lock:
            self.refusals.append({"at": now(), "rate": round(self.rate, 2), "why": why, "url": url})
            if self.ceiling is None:
                self.ceiling = self.rate
                self.rate = max(0.5, self.ceiling * self.hold)
            else:
                self.rate = max(0.5, self.rate * self.hold)
            self.history.append({"at": now(), "rate": self.rate, "requests": self.requests, "refused": why})
            self.next = time.time() + 60

    def state(self):
        with self.lock:
            return {"rate": round(self.rate, 2), "ceiling": self.ceiling, "requests": self.requests,
                    "refusals": self.refusals[-50:], "refusal_count": len(self.refusals), "history": self.history[-100:]}


class Gate:
    """Book pages (brief 75): how many pages are in flight at once. JANIS computes a book page on first request (25 to
    100 s for a neutron page with many EXFOR sets) and keeps it, so the pace is set by pages in flight, not requests a
    second. Starts at --start, adds --grow every --every-gate seconds while the limiter records no refusal, halves at a
    refusal; the in-flight count at the first refusal is the ceiling."""

    def __init__(self, start=2, grow=2, every=120.0, cap=24):
        self.limit, self.grow, self.every, self.cap = start, grow, every, cap
        self.active, self.cv = 0, threading.Condition()
        self.t, self.seen, self.ceiling, self.history = time.time(), 0, None, [{"at": now(), "limit": start}]

    def adjust(self):
        n = len(LIM.refusals)
        if n > self.seen:
            if self.ceiling is None:
                self.ceiling = self.limit
            self.limit = max(1, self.limit // 2)
            self.seen, self.t = n, time.time()
            self.history.append({"at": now(), "limit": self.limit, "refusal": LIM.refusals[-1]["why"]})
        elif time.time() - self.t >= self.every and self.limit < self.cap and (self.ceiling is None or self.limit + self.grow < self.ceiling):
            self.limit = min(self.cap, self.limit + self.grow)
            self.t = time.time()
            self.history.append({"at": now(), "limit": self.limit})

    def __enter__(self):
        with self.cv:
            self.adjust()
            while self.active >= self.limit:
                self.cv.wait(5)
                self.adjust()
            self.active += 1

    def __exit__(self, *exc):
        with self.cv:
            self.active -= 1
            self.cv.notify_all()

    def state(self):
        return {"limit": self.limit, "active": self.active, "ceiling": self.ceiling, "history": self.history[-60:]}


LIM = Limiter()
GATE = None
_local = threading.local()


def session():
    """This thread's opener with its own cookie jar; a new one starts at JANIS's home page (trap 7b)."""
    if getattr(_local, "opener", None) is None:
        _local.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        live(SITE + "/janisweb/", _local.opener)
    return _local.opener


def new_session():
    _local.opener = None
    return session()


def live(url, opener=None, tries=5, slow_ok=False):
    """(final URL, body text) from the site through the limiter; None on 404. A refusal is told to the limiter and
    retried; anything else is retried with a back-off; the last failure raises. slow_ok (book pages): a 504 or 524 is
    Cloudflare giving up on a page JANIS is still computing; JANIS finishes and keeps it, so the same request is made
    again after a wait, without slowing the other workers."""
    err = None
    for attempt in range(tries):
        LIM.wait()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/json,*/*"})
            with (opener.open(req, timeout=90) if opener else urllib.request.urlopen(req, timeout=90)) as r:
                body = r.read().decode("utf-8", "replace")
                final = r.geturl()
            if "Just a moment" in body[:2000] or "cf-chl" in body[:4000]:
                raise Refused("challenge")
            return final, body
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if slow_ok and e.code in (504, 524):
                with _lock:
                    stats["slow"] = stats.get("slow", 0) + 1
                time.sleep(30)
                err = e
                continue
            # 403, 429 and 503, and Cloudflare's own answers when the origin does not (502, 504, 520-527): the book
            # pages' first run (128 sessions a box) drew 525s from the origin, not the IP limit
            if e.code in (403, 429, 502, 503, 504) or 520 <= e.code <= 527:
                LIM.refused(f"HTTP {e.code}", url)
            else:
                time.sleep(5 * (attempt + 1))
            err = e
        except Refused as e:
            LIM.refused(str(e), url)
            err = e
        except (ConnectionRefusedError, ConnectionResetError) as e:
            LIM.refused(type(e).__name__, url)
            err = e
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            err = e
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"{url}: {err}")


def key_of(path):
    rest = path[len(ROOT):] or "/_base"
    return f"{CACHE}{urllib.parse.quote(rest, safe='/')}.html"


def fetch(path):
    """The page's HTML: from the cache, else from the site (cached once fetched). A page with no rows is a failure and
    is not cached (doctrine rule 0)."""
    k = key_of(path)
    try:
        body = s3.get_object(Bucket=BUCKET, Key=k)["Body"].read().decode("utf-8", "replace")
        with _lock:
            stats["cached"] += 1
        return body
    except s3.exceptions.NoSuchKey:
        pass
    url = SITE + urllib.parse.quote(path, safe="/'()=,:~-._")
    try:
        got = live(url)
        if got is None:
            raise RuntimeError("404")
        body = got[1]
        if not ROW.search(body):
            raise RuntimeError("no rows")
        s3.put_object(Bucket=BUCKET, Key=k, Body=body.encode(), ContentType="text/html")
        with _lock:
            stats["fetched"] += 1
        return body
    except Exception as e:  # noqa: BLE001
        with _lock:
            stats["failed"] += 1
            failures.append({"path": path, "error": str(e)[:200]})
        return None


def rows_of(body):
    out = []
    for li in ROW.findall(body):
        m = LINK.search(li)
        if not m:
            continue
        r = RENDERER.search(li)
        out.append({"label": html.unescape(m.group(2)).strip(), "href": html.unescape(m.group(1)),
                    "renderer": html.unescape(r.group(1)) if r else None})
    return out


def library_of(path):
    """The library segment of a path below Base/category ('JEFF-3.3', 'ENDF/B-VI.8' without the quotes), or ''."""
    rest = path[len(ROOT) + 1:]
    m = re.match(r"[^/]+/('[^']*'|[^/]+)", rest)
    return m.group(1).strip("'") if m else ""


def build(nodes, path):
    n = nodes[path]
    out = {"label": n["label"], "path": path[len(ROOT):] or "/", "href": SITE + path}
    if n.get("leaf"):
        out["leaf"] = n["leaf"]
    kids = [build(nodes, c) for c in n.get("children", [])]
    if kids or n.get("crawled"):
        out["children"] = kids
    out["crawled"] = bool(n.get("crawled"))
    out["counts"] = {"children": len(kids), "leaves": sum(1 for k in kids if "leaf" in k) +
                     sum(k["counts"]["leaves"] for k in kids if "counts" in k)}
    return out


def save(nodes, queue_sizes, started, done=False):
    tree = build(nodes, ROOT)
    body = json.dumps(tree, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=f"{OUT}/tree-raw.json", Body=body, ContentType="application/json")
    by_depth = {}
    for p, n in nodes.items():
        d = n["depth"]
        e = by_depth.setdefault(d, {"nodes": 0, "crawled": 0, "leaves": 0})
        e["nodes"] += 1
        e["crawled"] += bool(n.get("crawled"))
        e["leaves"] += bool(n.get("leaf"))
    # nodes per library and level (brief 75 C1)
    by_library = {}
    for p, n in nodes.items():
        lib = library_of(p)
        if lib and n["depth"] >= 2:
            e = by_library.setdefault(lib, {})
            e[str(n["depth"])] = e.get(str(n["depth"]), 0) + 1
    prog = {"updated": now(), "done": done, "minutes": round((time.time() - started) / 60, 1), "stats": stats,
            "queued": queue_sizes, "by_depth": by_depth, "by_library": by_library, "failures": failures[-200:],
            "limiter": LIM.state()}
    s3.put_object(Bucket=BUCKET, Key=f"{OUT}/progress.json", Body=json.dumps(prog, indent=1, ensure_ascii=False).encode(),
                  ContentType="application/json")
    print(json.dumps({k: prog[k] for k in ("minutes", "stats", "queued", "by_depth")}), flush=True)


def tree(a):
    """Brief 68's walk, breadth first by (phase, held-first, depth); pages of one depth are read 32 at a time."""
    started = time.time()
    nodes = {ROOT: {"label": "Base", "depth": 0, "children": []}}
    q, order = [], 0

    def push(path, depth):
        nonlocal order
        lib = library_of(path)
        if depth >= a.skip_held_from and lib in HELD_LIBS:
            return
        phase = 0 if depth <= 3 else 1
        heapq.heappush(q, (phase, 0 if (phase == 0 or lib in HELD_LIBS) else 1, depth, order, path))
        order += 1

    push(ROOT, 0)
    last_save = time.time()
    pool = cf.ThreadPoolExecutor(a.workers)
    while q and time.time() - started < a.hours * 3600:
        batch = [heapq.heappop(q)]
        while q and len(batch) < 64 and q[0][:3] == batch[0][:3]:
            batch.append(heapq.heappop(q))
        bodies = list(pool.map(lambda e: fetch(e[4]), batch))
        for (_, _, depth, _, path), body in zip(batch, bodies):
            if body is None:
                continue
            node = nodes[path]
            node["crawled"] = True
            for r in rows_of(body):
                child = r["href"]
                if child == path or not child.startswith(path + "/"):
                    continue  # the breadcrumb, or a link elsewhere
                if child not in nodes:
                    nodes[child] = {"label": r["label"], "depth": depth + 1, "children": []}
                    if r["renderer"]:
                        nodes[child]["leaf"] = {"renderer_id": r["renderer"].split("root=", 1)[-1]}
                    node["children"].append(child)
                    if not r["renderer"] and depth + 1 <= a.max_depth:
                        push(child, depth + 1)
            stats["by_depth"][str(depth)] = stats["by_depth"].get(str(depth), 0) + 1
        if time.time() - last_save > 300:
            save(nodes, sizes_of(q), started)
            last_save = time.time()
    save(nodes, sizes_of(q), started, done=not q)


def sizes_of(q):
    sizes = {}
    for e in q:
        sizes[str(e[2])] = sizes.get(str(e[2]), 0) + 1
    return sizes


def keys_under(prefix):
    out = set()
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=prefix):
        out.update(o["Key"] for o in page.get("Contents", []))
    return out


def mine(items, shard):
    i, n = (int(x) for x in shard.split("/"))
    return [x for x in items if int(hashlib.md5(x.encode()).hexdigest(), 16) % n == i]


def plan(a):
    """The element pages the tree walk would fetch (non-held libraries, depth 4) that the cache lacks."""
    have = keys_under(CACHE + "/")
    pool = cf.ThreadPoolExecutor(a.workers)
    level, seen, todo, libs = [(ROOT, 0)], {ROOT}, [], {}
    while level:
        nxt = []
        for (path, depth), body in zip(level, pool.map(lambda e: fetch(e[0]), level)):
            if body is None:
                raise RuntimeError(f"no page for {path}")
            for r in rows_of(body):
                child, d = r["href"], depth + 1
                if child == path or not child.startswith(path + "/") or r["renderer"] or child in seen:
                    continue
                seen.add(child)
                if d <= 3:
                    nxt.append((child, d))
                elif d == 4 and library_of(child) not in HELD_LIBS:
                    e = libs.setdefault(library_of(child), {"elements": 0, "cached": 0})
                    e["elements"] += 1
                    if key_of(child) in have:
                        e["cached"] += 1
                    else:
                        todo.append(child)
        level = nxt
    doc = {"made": now(), "elements": sum(e["elements"] for e in libs.values()),
           "cached": sum(e["cached"] for e in libs.values()), "todo": len(todo), "by_library": libs, "paths": todo}
    s3.put_object(Bucket=BUCKET, Key=TODO, Body=json.dumps(doc, ensure_ascii=False).encode(), ContentType="application/json")
    print(json.dumps({k: doc[k] for k in ("elements", "cached", "todo")}), flush=True)


class Progress:
    """A shard's progress file, rewritten every 30 seconds and at the end."""

    def __init__(self, key, total):
        self.key, self.total, self.done, self.failed, self.errors = key, total, 0, 0, []
        self.started = time.time()
        self.stop = threading.Event()
        threading.Thread(target=self.loop, daemon=True).start()

    def ok(self):
        with _lock:
            self.done += 1

    def fail(self, what, e):
        with _lock:
            self.failed += 1
            self.errors.append({"item": what, "error": str(e)[:300]})

    def write(self, finished=False):
        doc = {"updated": now(), "finished": finished, "total": self.total, "done": self.done, "failed": self.failed,
               "slow_retries": stats.get("slow", 0), "gate": GATE.state() if GATE else None,
               "minutes": round((time.time() - self.started) / 60, 1), "errors": self.errors[-200:], "limiter": LIM.state()}
        s3.put_object(Bucket=BUCKET, Key=self.key, Body=json.dumps(doc, indent=1, ensure_ascii=False).encode(),
                      ContentType="application/json")
        print(json.dumps({k: doc[k] for k in ("total", "done", "failed", "minutes")} | {"rate": doc["limiter"]["rate"],
                          "ceiling": doc["limiter"]["ceiling"]}), flush=True)

    def loop(self):
        while not self.stop.wait(30):
            self.write()

    def finish(self):
        self.stop.set()
        self.write(True)


def fetch_mode(a):
    paths = json.loads(s3.get_object(Bucket=BUCKET, Key=TODO)["Body"].read())["paths"]
    have = keys_under(CACHE + "/")
    paths = [p for p in mine(paths, a.shard) if key_of(p) not in have]
    prog = Progress(f"lake/_work/janis/fetch/{a.run}/shard-{a.shard.replace('/', '-of-')}.json", len(paths))

    def one(p):
        body = fetch(p)
        prog.ok() if body is not None else prog.fail(p, "see progress failures")

    with cf.ThreadPoolExecutor(a.workers) as ex:
        list(ex.map(one, paths))
    prog.finish()


def book_pages(books):
    out = []
    for b in books:
        body = s3.get_object(Bucket=BUCKET, Key=f"{RAILS}/janis-rail-{b}.jsonl")["Body"].read().decode()
        for line in body.splitlines():
            if not line.strip():
                continue
            n = json.loads(line)
            if n.get("error"):
                raise RuntimeError(f"rail line with an error: {line}")
            for m in n["mts"]:
                out.append({"book": b, "page": m["page"], "element": n["element"], "nuclide": n["label"], "mat": n["mat"],
                            "reac": m["reac"], "mt_label": m["label"]})
    return out


def page_key(p, ext):
    return f"{BOOKCACHE}/{p['book']}/{p['page']:05d}.{ext}"


def get_book_page(p):
    """(final URL, page HTML) for a book page, in this thread's session; a page without its embedded data is retried in a
    new session."""
    path = f"/janisweb/book/{p['book']}/{urllib.parse.quote(p['mat'], safe='')}/{urllib.parse.quote(p['reac'], safe='')}"
    for attempt in range(3):
        got = live(SITE + path, session(), tries=10, slow_ok=True)
        if got and "selectionTreeRows" in got[1] and "displayedTabs" in got[1] and "bookPageOutline" in got[1]:
            return got
        new_session()
    raise RuntimeError(f"no page data for {path}")


def books_mode(a):
    pages = book_pages(a.books.split(","))
    have = keys_under(BOOKCACHE + "/")
    ids = set(mine([f"{p['book']}/{p['page']}" for p in pages], a.shard))
    todo = [p for p in pages if f"{p['book']}/{p['page']}" in ids and page_key(p, "xml") not in have]
    if a.order:  # a list of "<book>/<page>" in the order to fetch (strata.mjs), nothing else
        by = {f"{p['book']}/{p['page']}": p for p in todo}
        order = json.loads(s3.get_object(Bucket=BUCKET, Key=a.order)["Body"].read())["order"]
        todo = [by[k] for k in order if k in by]
    prog = Progress(f"lake/_work/janis/books/{a.run}/shard-{a.shard.replace('/', '-of-')}.json", len(todo))

    def one(p):
        try:
            t0 = time.time()
            with (GATE or threading.Lock()):
                final, body = get_book_page(p)
            seconds = round(time.time() - t0, 1)
            got = live(final.rstrip("/") + "/saveState.xml", session())
            if not got or not got[1].lstrip("﻿ \n").startswith("<?xml") or "<renderer" not in got[1]:
                raise RuntimeError("no saved state")
            meta = dict(p, url=final, fetched=now(), seconds=seconds)
            s3.put_object(Bucket=BUCKET, Key=page_key(p, "html"), Body=body.encode(), ContentType="text/html")
            s3.put_object(Bucket=BUCKET, Key=page_key(p, "json"), Body=json.dumps(meta, ensure_ascii=False).encode(),
                          ContentType="application/json")
            s3.put_object(Bucket=BUCKET, Key=page_key(p, "xml"), Body=got[1].encode(), ContentType="application/xml")
            prog.ok()
        except Exception as e:  # noqa: BLE001
            prog.fail(f"{p['book']}/{p['page']}", e)

    with cf.ThreadPoolExecutor(a.workers) as ex:
        list(ex.map(one, todo))
    prog.finish()


# ---------- C3: the per-page reference ----------

def js_json(htmltext, var):
    """A `var <name> = jQuery.parseJSON('...');` value."""
    i = htmltext.find(f"var {var} = jQuery.parseJSON('")
    if i < 0:
        return None
    i += len(f"var {var} = jQuery.parseJSON('")
    j = htmltext.find("');", i)
    s = htmltext[i:j].replace("\\'", "'").replace("\\\\", "\\")
    return json.loads(s)


def sheet_rows(htmltext):
    m = re.search(r"selectionTreeRows = (\[.*?\]);\s*\n", htmltext, re.S)
    return json.loads(m.group(1)) if m else None


def right_rail(htmltext):
    """The cards column (janis-viewer-cards): each fieldset's legend and its items in order."""
    i, j = htmltext.find('id="janis-viewer-cards"'), htmltext.find('id="janis-dialog-tabler-xvalues-custom"')
    part = htmltext[i:j] if i >= 0 else ""
    cards = []
    for fs in re.finditer(r"<fieldset([^>]*)>(.*?)</fieldset>", part, re.S):
        legend = re.search(r"<legend>([^<]*)</legend>", fs.group(2))
        items = []
        for m in re.finditer(r'<input[^>]*type="button"[^>]*value="([^"]*)"|<td[^>]*>([^<]{1,40}?)</td>|<select id="([^"]*)"'
                             r'|<input type="checkbox"[^>]*id="([^"]*)"', fs.group(2)):
            v = next(x for x in m.groups() if x is not None)
            v = html.unescape(v).replace("\xa0", " ").strip()
            if v and v != "&nbsp;":
                items.append(v)
        idm = re.search(r'id="([^"]*)"', fs.group(1))
        cards.append({"id": idm.group(1) if idm else None, "legend": legend.group(1).strip() if legend else None,
                      "items": items})
    return cards


def kind_of(ref):
    if "~EXFOR~" in ref:
        return "EXFOR"
    return "computed" if "calc[" in ref else "evaluated"


def library_of_ref(ref):
    parts = ref.split("~")
    return parts[2] if len(parts) > 2 else None


def parse_state(xmltext):
    root = ET.fromstring(xmltext.lstrip("﻿"))
    plot = root.find("plot")
    out = {"version": root.get("version")}
    if plot is None:
        return out
    xr, yr = plot.find("xrange"), plot.find("yrange")
    out["x"] = {"variable": (plot.find("xvar").get("key") if plot.find("xvar") is not None else None),
                "scale": plot.findtext("xscale"), "min": xr.get("min") if xr is not None else None,
                "max": xr.get("max") if xr is not None else None}
    out["y"] = {"scale": plot.findtext("yscale"), "min": yr.get("min") if yr is not None else None,
                "max": yr.get("max") if yr is not None else None}
    series = []
    for d in plot.findall("data"):
        layer = d.find("layer")
        s = {"ref": d.get("refs"), "title": d.findtext("title")}
        if layer is not None:
            s["color"] = layer.findtext("color")
            if layer.find("mark") is not None:
                s["symbol"] = layer.findtext("mark")
            if layer.find("stroke") is not None:
                s["line"] = layer.findtext("stroke")
            if layer.find("showYErrors") is not None:
                s["y_errors"] = layer.findtext("showYErrors") == "true"
        series.append(s)
    out["drawing_order"] = series
    strings = plot.find("settings/strings")
    if strings is not None:
        for tag in ("title", "xAxisLabel", "yAxisLabel"):
            e = strings.find(tag)
            if e is not None:
                out[tag] = {"display": e.get("display") == "true", "automatic": e.get("automatic") == "true",
                            "template": e.get("automaticTemplate"), "text": e.get("manualText")}
        lg = strings.find("legend")
        out["legend_display"] = lg is not None and lg.get("display") == "true"
    return out


def reference_page(p):
    h = s3.get_object(Bucket=BUCKET, Key=page_key(p, "html"))["Body"].read().decode("utf-8", "replace")
    x = s3.get_object(Bucket=BUCKET, Key=page_key(p, "xml"))["Body"].read().decode("utf-8", "replace")
    meta = json.loads(s3.get_object(Bucket=BUCKET, Key=page_key(p, "json"))["Body"].read())
    rows = sheet_rows(h) or []
    tabs = js_json(h, "displayedTabs") or []
    outline = js_json(h, "bookPageOutline")
    st = parse_state(x)
    card = tabs[0].get("viewerCardWeb", {}) if tabs else {}
    drawn = st.get("drawing_order", [])
    legend = list(reversed(drawn))  # JANIS's legend lists the last-drawn series first (checked on 44-Yb-176 MT2)
    series = []
    for s in legend:
        k = kind_of(s["ref"])
        e = {"ref": s["ref"], "title": s["title"], "kind": k, "library": library_of_ref(s["ref"]),
             "computed": (re.search(r"calc\[([^\]]*)\]", s["ref"]).group(1) if k == "computed" else None),
             "asterisk": "*" in (s["title"] or ""), "color": s.get("color")}
        if "symbol" in s:
            e["symbol"] = s["symbol"]
        if "line" in s:
            e["line"] = s["line"]
        if "y_errors" in s:
            e["y_errors"] = s["y_errors"]
        if k == "EXFOR":
            e["exfor_id"] = s["ref"].rsplit("~X4_", 1)[-1] if "~X4_" in s["ref"] else None
        series.append(e)
    libs = []
    for e in series:
        if e["kind"] != "EXFOR" and e["library"] not in libs:
            libs.append(e["library"])
    exfor = [e["exfor_id"] for e in series if e["kind"] == "EXFOR"]
    # the page's own nuclide in its outline: its MTs in order (checked against the rail file)
    rail_mts = None
    if outline:
        def walk(n):
            nonlocal rail_mts
            if n.get("label") == p["nuclide"] and n.get("children"):
                rail_mts = [c.get("label") for c in n["children"]]
            for c in n.get("children") or []:
                walk(c)
        for n in outline:
            walk(n)
    return {
        "page": p["page"], "element": p["element"], "nuclide": p["nuclide"], "mat": p["mat"], "reac": p["reac"],
        "mt_label": p["mt_label"], "asterisk": "*" in p["mt_label"], "url": meta["url"],
        "title": st.get("title"), "tab_title": card.get("tabTitle"),
        "pane": tabs[0].get("paneUrl") if tabs else None,  # the viewer shown: its card is the one visible on the right
        "x_axis": dict(st.get("x", {}), name=(card.get("xvariable") or {}).get("name"), label=st.get("xAxisLabel"),
                       scale_types=card.get("availXScaleTypes"), variables=[v.get("name") for v in card.get("variables") or []]),
        "y_axis": dict(st.get("y", {}), label=st.get("yAxisLabel"), scale_types=card.get("availYScaleTypes")),
        "legend_display": st.get("legend_display"),
        "default_release": libs[0] if libs else None,
        "libraries": libs,
        "series": series,
        "exfor": {"count": len(exfor), "ids": exfor},
        "displayed_refs": tabs[0].get("displayedRefs") if tabs else None,
        "sheet": [{"label": r["label"], "ref": r["refsStr"], "toggles": r.get("tsLabels"), "on": r.get("tsSelecteds")}
                  for r in rows if r.get("pid", -1) >= 0],
        "rail_mts": rail_mts,
        "card": right_rail(h),
    }


def reference(a):
    pool = cf.ThreadPoolExecutor(a.workers)
    summary = {}
    for b in a.books.split(","):
        pages = book_pages([b])
        recs, errors = [], []
        for p, r in zip(pages, pool.map(lambda p: _try(reference_page, p), pages)):
            (errors.append({"page": p["page"], "error": r["error"]}) if "error" in r else recs.append(r))
        rail, seen = [], {}
        for p in pages:
            key = (p["element"], p["nuclide"])
            if key not in seen:
                seen[key] = {"element": p["element"], "nuclide": p["nuclide"], "mat": p["mat"], "mts": []}
                rail.append(seen[key])
            seen[key]["mts"].append({"label": p["mt_label"], "reac": p["reac"], "page": p["page"]})
        # the cards column is the same markup on every page: kept once, with the number of pages that differ
        cards = recs[0]["card"] if recs else None
        differ = sum(1 for r in recs if r["card"] != cards)
        for r in recs:
            r.pop("card")
        rail_mismatch = [r["page"] for r in recs if r["rail_mts"] is not None and
                         r["rail_mts"] != [m["label"] for m in seen[(r["element"], r["nuclide"])]["mts"]]]
        doc = {"book": b, "built": now(), "source": f"{SITE}/janisweb/book/{b}", "pages": len(recs),
               "expected_pages": len(pages), "nuclides": len(rail), "errors": errors, "right_rail": cards,
               "right_rail_pages_differing": differ, "rail_pages_differing_from_rail_file": rail_mismatch,
               "left_rail": rail, "page_records": recs}
        s3.put_object(Bucket=BUCKET, Key=f"{REF}/{b}.json", Body=json.dumps(doc, ensure_ascii=False).encode(),
                      ContentType="application/json")
        summary[b] = {"pages": len(recs), "expected": len(pages), "nuclides": len(rail), "errors": len(errors),
                      "rail_mismatch": len(rail_mismatch), "card_differ": differ}
        print(json.dumps({b: summary[b]}), flush=True)
    s3.put_object(Bucket=BUCKET, Key=f"{REF}/index.json", Body=json.dumps({"built": now(), "books": summary}).encode(),
                  ContentType="application/json")


def _try(f, *args):
    try:
        return f(*args)
    except Exception as e:  # noqa: BLE001
        return {"error": f"{type(e).__name__}: {e}"[:300]}


# ---------- C4: Tabler values for a fixed sample ----------

def sample(pages, n=10):
    """n pages a book, evenly spaced through its page order (first and last included)."""
    if len(pages) <= n:
        return pages
    return [pages[round(i * (len(pages) - 1) / (n - 1))] for i in range(n)]


def tabler_page(p, refs):
    final, _ = get_book_page(p)
    rid = final.rstrip("/").rsplit("/", 1)[-1]
    out = []
    for ref in refs:
        q = urllib.parse.urlencode({"rendererId": rid, "show": "true", "producerId": f"janis-render-T-{ref}",
                                    "width": 800, "height": 600})
        got = live(f"{final.rstrip('/')}/toogleProducer.json?{q}", session())
        vk = json.loads(got[1])["viewerKey"]
        got = live(f"{final.rstrip('/')}/tabler/{vk}/csv", session())
        lines = [ln for ln in got[1].lstrip("﻿").splitlines() if ln.strip()]
        head, data = [], []
        for ln in lines:
            cells = [c.strip() for c in ln.split(";")]
            try:
                data.append([float(c) for c in cells if c != ""])
            except ValueError:
                head.append(ln)
        if not data:
            raise RuntimeError(f"no Tabler rows for {ref}")
        out.append({"ref": ref, "viewer": vk, "header": head, "rows": len(data), "values": data})
    return {"book": p["book"], "page": p["page"], "nuclide": p["nuclide"], "reac": p["reac"], "url": final,
            "fetched": now(), "series": out}


def tabler_mode(a):
    todo = []
    for b in a.books.split(","):
        ref = json.loads(s3.get_object(Bucket=BUCKET, Key=f"{REF}/{b}.json")["Body"].read())
        recs = {r["page"]: r for r in ref["page_records"]}
        for p in sample(book_pages([b])):
            r = recs.get(p["page"])
            if r:
                todo.append((p, [s["ref"] for s in r["series"] if s["kind"] != "EXFOR"]))
    ids = set(mine([f"{t[0]['book']}/{t[0]['page']}" for t in todo], a.shard))
    todo = [t for t in todo if f"{t[0]['book']}/{t[0]['page']}" in ids]
    prog = Progress(f"lake/_work/janis/tabler/{a.run}/shard-{a.shard.replace('/', '-of-')}.json", len(todo))

    def one(t):
        p, refs = t
        try:
            doc = tabler_page(p, refs)
            s3.put_object(Bucket=BUCKET, Key=f"{REF}/tabler/{p['book']}/{p['page']:05d}.json",
                          Body=json.dumps(doc, ensure_ascii=False).encode(), ContentType="application/json")
            prog.ok()
        except Exception as e:  # noqa: BLE001
            prog.fail(f"{p['book']}/{p['page']}", e)

    with cf.ThreadPoolExecutor(a.workers) as ex:
        list(ex.map(one, todo))
    prog.finish()


def main():
    global LIM
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="tree", choices=["tree", "plan", "fetch", "books", "reference", "tabler"])
    ap.add_argument("--hours", type=float, default=20)
    ap.add_argument("--max-depth", type=int, default=4, help="deepest level whose page is fetched (4: element pages, which list the isotopes)")
    ap.add_argument("--skip-held-from", type=int, default=4, help="for the libraries the lake holds, fetch no page this deep or deeper: mark.py builds their rows from the lake")
    ap.add_argument("--shard", default="0/1")
    ap.add_argument("--workers", type=int, default=32)
    ap.add_argument("--rate", type=float, default=1.0)
    ap.add_argument("--ramp", action="store_true")
    ap.add_argument("--step", type=float, default=1.0)
    ap.add_argument("--every", type=float, default=30.0)
    ap.add_argument("--hold", type=float, default=0.8)
    ap.add_argument("--books", default=",".join(BOOKS))
    ap.add_argument("--order", default="", help="books: S3 key of a JSON with an order list of <book>/<page> (strata.mjs)")
    ap.add_argument("--gate", type=int, default=0, help="book pages: start this many in flight and grow (Gate); 0 = no gate")
    ap.add_argument("--grow", type=int, default=2)
    ap.add_argument("--every-gate", type=float, default=120.0)
    ap.add_argument("--run", default=time.strftime("%Y%m%dT%H%M", time.gmtime()))
    a = ap.parse_args()
    LIM = Limiter(rate=a.rate, ramp=a.ramp, step=a.step, every=a.every, hold=a.hold)
    global GATE
    if a.gate:
        GATE = Gate(start=a.gate, grow=a.grow, every=a.every_gate, cap=a.workers)
    {"tree": tree, "plan": plan, "fetch": fetch_mode, "books": books_mode, "reference": reference,
     "tabler": tabler_mode}[a.mode](a)


if __name__ == "__main__":
    sys.exit(main())
