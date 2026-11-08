# Everything www.nndc.bnl.gov offers for download, as one list for scripts/nndc/pull.py. Sources (2026-11-07):
#   1. the two crawls (scripts/nndc/crawl.py): every static file link on the site, and the HTML pages themselves
#   2. the archive apps' file lists: ensdfarchivals, nsrarchivals, xundlarchivals (distributions/files.json),
#      walletcardsarchivals (editions/files.json)
#   3. the ENDF releases app: releases/<version>/metadata.json for B-I … B-VIII.1. A full-library archive is
#      taken per format; sublibrary archives only where a format has no full archive (they are subsets of it)
#   4. the data apps' bulk files: B(E2), double-beta decay, MACS, low-fidelity covariances, NuDat 3 chart data,
#      NSR dictionaries, and all 287 CapGam datasets through /capgam/api/json/
# Archive pairs that hold the same files (.zip beside .tgz/.tar.gz of one name) keep the tar and are listed as
# duplicates. Images (logos, photos, plot PNGs) are not taken.
#   python3 -I scripts/nndc/list.py <workdir> <lake-prefix>      # e.g. raw/nndc/2026-11-07
# Writes <workdir>/list.jsonl ({url, key, group}) and <workdir>/skipped.jsonl ({url, reason}).
import json, os, re, sys, urllib.parse, urllib.request

os.chdir(sys.argv[1])
PREFIX = sys.argv[2].rstrip("/")
SITE = "https://www.nndc.bnl.gov"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
VERSIONS = ["B-VIII.1", "B-VIII.0", "B-VII.1", "B-VII.0", "B-VI.8", "B-V", "B-IV", "B-III", "B-II", "B-I"]
items, skipped = {}, []


def get(path):
    req = urllib.request.Request(SITE + path, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=60).read()


def key_for(url):
    p = urllib.parse.urlparse(url)
    path = urllib.parse.unquote(p.path).lstrip("/")
    if p.query:
        return f"{PREFIX}/{path.rstrip('/')}/{urllib.parse.quote(urllib.parse.unquote_plus(p.query.split('=', 1)[-1]), safe='')}.json"
    if path == "" or path.endswith("/"):
        path += "index.html"
    return f"{PREFIX}/{path}"


def add(url, group):
    url = url.replace("http://www.nndc.bnl.gov", SITE)
    p = urllib.parse.urlparse(url)
    url = p._replace(path=urllib.parse.quote(urllib.parse.unquote(p.path), safe="/")).geturl()  # spaces in hrefs
    if url not in items:
        items[url] = {"url": url, "key": key_for(url), "group": group}


# 1. crawls
for fn, grp in [("files.jsonl", "site-file"), ("files2.jsonl", "site-file")]:
    for l in open(fn):
        add(json.loads(l)["url"], grp)
for fn in ["pages.jsonl", "pages2.jsonl"]:
    for l in open(fn):
        d = json.loads(l)
        if "error" not in d:
            add(d["url"], "site-page")

# 2. archive apps
for sec, sub in [("ensdfarchivals", "distributions"), ("nsrarchivals", "distributions"), ("xundlarchivals", "distributions")]:
    d = json.loads(get(f"/{sec}/{sub}/files.json"))
    groups = d[sub] + ([d["latest"]] if d.get("latest") else [])
    for g in groups:
        for f in g["files"]:
            add(f"{SITE}/{sec}/{sub}/dist{g['year'][2:]}/{urllib.parse.quote(f)}", sec)
d = json.loads(get("/walletcardsarchivals/editions/files.json"))
for g in d["editions"] + ([d["latest"]] if d.get("latest") else []):
    for f in g["files"]:
        add(f"{SITE}/walletcardsarchivals/editions/{urllib.parse.quote(f['name'])}", "walletcardsarchivals")

# 3. ENDF releases
seeds2 = set()
for v in VERSIONS:
    m = json.loads(get(f"/endf-releases/releases/{v}/metadata.json"))
    add(f"{SITE}/endf-releases/releases/{v}/metadata.json", "endf-releases")
    full = {k: f for k, f in (m.get("files") or {}).items() if isinstance(f, dict) and "name" in f}
    if not full and "notFound" in (m.get("files") or {}):
        skipped.append({"url": f"{SITE}/endf-releases/?version={v}", "reason": f"NNDC has no copy of ENDF/{v}: it is still looking for the data and its summary"})
    for fmt, f in full.items():
        add(f"{SITE}/endf-releases/releases/{v}/{urllib.parse.quote(f['name'])}", f"endf-{v}")
    for lib, s in (m.get("sublibraries") or {}).items():
        for fmt, f in (s.get("files") or {}).items():
            if not isinstance(f, dict) or "name" not in f:
                continue
            u = f"{SITE}/endf-releases/releases/{v}/{lib}/{urllib.parse.quote(f['name'])}"
            if fmt in full:
                skipped.append({"url": u, "reason": f"subset of the full {v} {fmt} archive"})
            else:
                add(u, f"endf-{v}")
    for r in m.get("resources", []):
        h = r["href"]
        if h.startswith("/endf-library/"):
            seeds2.add(SITE + h.rstrip("/") + "/")
        elif h.startswith("/"):
            add(SITE + h, f"endf-{v}")
add(f"{SITE}/endf-releases/releases/descriptions.json", "endf-releases")
open("seeds2.txt", "w").write("\n".join(sorted(seeds2)) + "\n")

# 4. data apps
for p in ["/be2/data/adopted-entries.json", "/be2/data/experimental-entries.json", "/be2/data/predicted-entries.json",
          "/bbdecay/data/adopted-entries.json", "/bbdecay/data/experimental-entries.json",
          "/astro/AstroENDF.zip", "/astro/ENDFB71-EAF2010.zip", "/nudat3/data/output.json",
          "/nsr/dictionary/author-names.json", "/nsr/dictionary/nuclide-ids.json", "/nsr/dictionary/reaction-codes.json",
          "/capgam/data/periodic-table.json", "/capgam/api/periodic-table/dsids-by-z", "/lowfi/entry-map.json"]:
    add(SITE + p, "data-app")
for z, names in json.loads(get("/capgam/api/periodic-table/dsids-by-z")).items():
    for n in names:
        add(f"{SITE}/capgam/api/json/?dsid={urllib.parse.quote(n)}", "capgam")
for z, entries in json.loads(get("/lowfi/entry-map.json")).items():
    for e in entries:
        add(f"{SITE}/lowfi/data-files/{urllib.parse.quote(e['file_name'])}", "lowfi")

# duplicates: name.zip beside name.tgz / name.tar.gz in the same folder
by_stem = {}
for u in items:
    m = re.match(r"(.*)\.(zip|tgz|tar\.gz)$", u)
    if m:
        by_stem.setdefault(m.group(1), []).append(u)
for stem, us in by_stem.items():
    if len(us) > 1:
        for u in us:
            if u.endswith(".zip"):
                skipped.append({"url": u, "reason": "same files as " + [x for x in us if x != u][0].rsplit("/", 1)[-1]})
                items.pop(u)

with open("list.jsonl", "w") as f:
    for it in items.values():
        f.write(json.dumps(it) + "\n")
with open("skipped.jsonl", "w") as f:
    for s in skipped:
        f.write(json.dumps(s) + "\n")
from collections import Counter
print(len(items), "items;", len(skipped), "skipped;", Counter(i["group"] for i in items.values()).most_common())
