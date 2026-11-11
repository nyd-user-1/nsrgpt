"""JANIS Web's browse tree, crawled whole (brief 68). Runs on a box (python3 with boto3), never on the Mac.

  python3 crawl.py [--hours 20] [--max-depth 6]

https://www.oecd-nea.org/janisweb/tree is server-rendered: each page is a breadcrumb and a list of rows
(<li class="list-group-item">), each row a link one level down; a row with an Open button carries a renderer id
(data-renderer="/janisweb/renderer?root=~N~JEFF-3.3~SIG~Ni56~MT2") and is a leaf. The levels: Base (0) → category (1) →
library (2) → data type (3) → element (4) → isotope (5) → the leaf rows on the isotope page. Labels are kept verbatim.

One request a second, one page at a time, User-Agent naming NSRgpt. Every fetched page is cached under
s3://nsr-lake-613473203863/lake/_work/janis/pages/<path>.html, so a rerun reads the cache and fetches only what is new.
Breadth first: every page down to the data types, then the element pages (which list isotopes) and the isotope pages
(which list the leaves), the libraries the lake holds first. The tree is written every few minutes and at the end
to lake/janis/2026-11-10/tree.json (marked by mark.py's rules when held.json is there; see README.md), with
progress.json beside it."""
import argparse
import heapq
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import boto3

BUCKET, REGION = "nsr-lake-613473203863", "us-east-2"
SITE, ROOT = "https://www.oecd-nea.org", "/janisweb/tree"
CACHE, OUT = "lake/_work/janis/pages", "lake/janis/2026-11-10"
UA = "Mozilla/5.0 (compatible; NSRgpt-crawler/1.0; nsrgpt.com; one request a second)"
ROW = re.compile(r'<li class="list-group-item[^"]*"[^>]*>(.*?)</li>', re.S)
LINK = re.compile(r'<a href="(/janisweb/tree[^"]*)"[^>]*>([^<]*)</a>')
RENDERER = re.compile(r'data-renderer="([^"]*)"')
# JANIS library rows the lake holds (brief 68's rule): the releases in nsr.endfb_materials, EXFOR, CINDA and the 2020
# masses; their pages go first in the element and isotope phases.
HELD_LIBS = {"EXFOR", "CINDA", "ENDF/B-VI.8", "ENDF/B-VII.0", "ENDF/B-VII.1", "ENDF/B-VIII.0", "JEFF-3.3", "CENDL-3.2",
             "Nubase 2020", "NUBASE2020"}

s3 = boto3.client("s3", region_name=REGION)
_last = [0.0]
stats = {"fetched": 0, "cached": 0, "failed": 0, "by_depth": {}}
failures = []


def key_of(path):
    rest = path[len(ROOT):] or "/_base"
    return f"{CACHE}{urllib.parse.quote(rest, safe='/')}.html"


def fetch(path):
    """The page's HTML: from the cache, else from the site (one request a second, four tries with a back-off)."""
    k = key_of(path)
    try:
        body = s3.get_object(Bucket=BUCKET, Key=k)["Body"].read().decode("utf-8", "replace")
        stats["cached"] += 1
        return body
    except s3.exceptions.NoSuchKey:
        pass
    url = SITE + urllib.parse.quote(path, safe="/'()=,:~-._")
    for attempt in range(4):
        wait = 1.0 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read().decode("utf-8", "replace")
            if "Just a moment" in body[:2000]:
                raise urllib.error.HTTPError(url, 503, "challenge", None, None)
            s3.put_object(Bucket=BUCKET, Key=k, Body=body.encode(), ContentType="text/html")
            stats["fetched"] += 1
            return body
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            code = getattr(e, "code", None)
            if code == 404:
                break
            time.sleep(15 * (attempt + 1))
    stats["failed"] += 1
    failures.append(path)
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
    prog = {"updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "done": done,
            "minutes": round((time.time() - started) / 60, 1), "stats": stats, "queued": queue_sizes,
            "by_depth": by_depth, "failures": failures[-200:]}
    s3.put_object(Bucket=BUCKET, Key=f"{OUT}/progress.json", Body=json.dumps(prog, indent=1).encode(),
                  ContentType="application/json")
    print(json.dumps({k: prog[k] for k in ("minutes", "stats", "queued", "by_depth")}), flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=float, default=20)
    ap.add_argument("--max-depth", type=int, default=4, help="deepest level whose page is fetched (4: element pages, which list the isotopes)")
    ap.add_argument("--skip-held-from", type=int, default=4, help="for the libraries the lake holds, fetch no page this deep or deeper: mark.py builds their rows from the lake")
    a = ap.parse_args()
    started = time.time()
    nodes = {ROOT: {"label": "Base", "depth": 0, "children": []}}
    # priority: (phase, held-first, depth, order). Phase 0 fetches down to the data types; phase 1 the element and
    # isotope pages, the held libraries first.
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
    while q and time.time() - started < a.hours * 3600:
        _, _, depth, _, path = heapq.heappop(q)
        body = fetch(path)
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
        if time.time() - last_save > 300 or (q and q[0][0] == 1 and stats.get("phase0_saved") is None):
            if q and q[0][0] == 1:
                stats["phase0_saved"] = True
            sizes = {}
            for e in q:
                sizes[str(e[2])] = sizes.get(str(e[2]), 0) + 1
            save(nodes, sizes, started)
            last_save = time.time()
    sizes = {}
    for e in q:
        sizes[str(e[2])] = sizes.get(str(e[2]), 0) + 1
    save(nodes, sizes, started, done=not q)


if __name__ == "__main__":
    sys.exit(main())
