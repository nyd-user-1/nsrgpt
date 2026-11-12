"""Brief 74, B4: what JANIS Web computes on its book pages. Runs on a box (python3 with boto3), one request a second.

  janis_book.py [neutrons gammas protons deuterons tritons he3 alphas]

Per book: /janisweb/book/<book> (redirects to its first page) carries the page index as JSON ({label, page, matIdStr,
reacIdStr, children}) with only that page's element expanded, so one page per element is fetched for the whole index;
then one page for each distinct reacIdStr (the first nuclide that has it), and
its selectionTreeRows (every series the page draws: label, refsStr, tsSelecteds) are kept. A computed series is a ref
with a calc[...] part (e.g. ~N~TENDL-2019~DA/DE~Ru104~MT5~calc[MF3+MF6MT5]). Writes
lake/_work/parse/endfb/recon/janis/book/<book>.json (pages index, sampled pages, their rows) and prints the kinds.
"""
import http.cookiejar
import json
import re
import sys
import time
import urllib.parse
import urllib.request

import boto3

SITE = "https://www.oecd-nea.org"
UA = "Mozilla/5.0 (NSRgpt research; one request a second)"
B, REGION, OUT = "nsr-lake-613473203863", "us-east-2", "lake/_work/parse/endfb/recon/janis/book"
s3 = boto3.client("s3", region_name=REGION)
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
last = [0.0]


def get(path):
    wait = 1.0 - (time.time() - last[0])
    if wait > 0:
        time.sleep(wait)
    url = SITE + urllib.parse.quote(path, safe="/~:()=,'-._")
    for attempt in range(4):
        try:
            last[0] = time.time()
            with op.open(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90) as r:
                return r.geturl(), r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print("retry", url, e, flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"failed {url}")


def leaves(node, out):
    if node.get("page", -1) > 0 and node.get("matIdStr") and node.get("reacIdStr") and not node.get("children"):
        out.append({k: node[k] for k in ("label", "page", "matIdStr", "reacIdStr")})
    for c in node.get("children") or []:
        leaves(c, out)
    return out


def index(html):
    i = html.find('{"label":"By nuclide"')
    if i < 0:
        raise RuntimeError("no page index")
    obj, _ = json.JSONDecoder().raw_decode(html[i:])
    return obj


def rows(html):
    m = re.search(r"selectionTreeRows = (\[.*?\]);\s*\n", html, re.S)
    return json.loads(m.group(1)) if m else []


def book(name):
    _, html = get(f"/janisweb/book/{name}")
    top = index(html)
    # a page expands only its own element: fetch each element's first page for its nuclides' rows
    elements = [c for c in top.get("children") or [] if c.get("page", -1) > 0]
    pages = {}
    for el in elements:
        _, h = get(f"/janisweb/book/{name}/{el['matIdStr']}/{el['reacIdStr']}")
        for p in leaves(index(h), []):
            if p["label"].startswith("MT"):  # reaction rows; unexpanded element and nuclide rows are not pages
                pages[p["page"]] = p
    pages = sorted(pages.values(), key=lambda p: p["page"])
    first = {}
    for p in sorted(pages, key=lambda p: p["page"]):
        first.setdefault(p["reacIdStr"], p)
    sampled = []
    for reac, p in sorted(first.items(), key=lambda kv: kv[1]["page"]):
        url, h = get(f"/janisweb/book/{name}/{p['matIdStr']}/{reac}")
        rs = rows(h)
        sampled.append({**p, "url": url, "rows": [{"label": r["label"], "ref": r["refsStr"], "ts": r["tsLabels"],
                                                    "on": r["tsSelecteds"]} for r in rs if r.get("pid", -1) >= 0]})
    kinds = {}
    for s in sampled:
        for r in s["rows"]:
            for k in re.findall(r"calc\[([^\]]*)\]", r["ref"]):
                kinds.setdefault(k, []).append(f"{s['matIdStr']} {s['reacIdStr']}")
    doc = {"book": name, "fetched": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "pages": len(pages),
           "distinct_reactions": len(first), "calc_kinds": {k: {"pages": len(v), "examples": v[:5]} for k, v in kinds.items()},
           "sampled": sampled, "index": pages}
    s3.put_object(Bucket=B, Key=f"{OUT}/{name}.json", Body=json.dumps(doc).encode(), ContentType="application/json")
    print(json.dumps({"book": name, "pages": len(pages), "reactions": len(first),
                      "calc_kinds": {k: len(v) for k, v in kinds.items()}}), flush=True)


if __name__ == "__main__":
    get("/janisweb/")
    for b in sys.argv[1:] or ["neutrons", "gammas", "protons", "deuterons", "tritons", "he3", "alphas"]:
        try:
            book(b)
        except Exception as ex:  # noqa: BLE001
            print(json.dumps({"book": b, "error": str(ex)}), flush=True)
