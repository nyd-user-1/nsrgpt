# nsr-api routes for GNDS 2.0 (brief 60): the ENDF-6 releases in the lake compiled to GNDS 2.0 by LLNL FUDGE 6.14.0
# (scripts/gnds/compile.py on the nsr-gnds boxes): lake/gnds/<release>/<sub>/<mat>.xml.gz and <mat>.cov.xml.gz,
# catalog nsr.gnds_files, lake/gnds/<release>/index.json and lake/gnds/manifest.json, served by CloudFront under /lake/gnds/.
#   GET /gnds?release=B-VIII.1&name=U-235&sub=neutrons   the precompiled file: {release, sublibrary, mat, za, name, url,
#                                  cov_url, bytes, cov_bytes, fudge_version, gnds_version}; name (U-235, u235, 235U) or
#                                  mat (9228); sub defaults to neutrons. Not precompiled: 404 {error, job}, job being the
#                                  POST /jobs body that compiles it on demand ({kind: "gnds", params}, services/nsr-jobs)
#   GET /gnds/releases             the manifest's counts per release and sublibrary
# The index and manifest are read through the CDN (they carry max-age=300), so this Lambda needs no lake/gnds/ grant.
import json
import time
import urllib.error
import urllib.request

import structure as S

CDN = "https://daw1qggkn69lv.cloudfront.net"
FUDGE_VERSION = "6.14.0"
TTL = 300
_cache = {}


def fetch(key):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < TTL:
        return hit[1]
    try:
        with urllib.request.urlopen(f"{CDN}/{key}", timeout=10) as r:
            doc = json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):
            doc = None
        else:
            raise
    _cache[key] = (time.time(), doc)
    return doc


def find(q):
    release = q.get("release") or "B-VIII.1"
    sub = (q.get("sub") or "neutrons").strip().lower()
    name = S.material_name(q["name"]) if q.get("name") else None
    mat = int(q["mat"]) if (q.get("mat") or "").strip().isdigit() else None
    if not (name or mat):
        return 400, {"error": "name (U-235) or mat (9228) is required"}
    params = {"release": release, "sub": sub, **({"name": name} if name else {}), **({"mat": mat} if mat else {})}
    idx = fetch(f"lake/gnds/{release}/index.json") or {}
    for r in idx.get("files", []):
        if r["sublibrary"] == sub and ((mat and r["mat"] == mat) or (name and r["name"].upper() == name.upper())):
            return 200, {"release": release, "sublibrary": sub, "mat": r["mat"], "za": r["za"], "name": r["name"],
                         "url": f"{CDN}/{r['key']}", "cov_url": f"{CDN}/{r['cov_key']}" if r.get("cov_key") else None,
                         "bytes": r["bytes"], "cov_bytes": r.get("cov_bytes"),
                         "fudge_version": idx.get("fudge_version", FUDGE_VERSION), "gnds_version": r.get("gnds_version")}
    return 404, {"error": f"{name or mat} in {release} {sub} is not precompiled as GNDS 2.0",
                 "job": {"method": "POST", "path": "/jobs", "body": {"kind": "gnds", "params": params}}}


def releases():
    m = fetch("lake/gnds/manifest.json")
    if not m:
        return 404, {"error": "no GNDS manifest yet"}
    keep = ("materials", "converted", "failed", "bytes", "wall_minutes", "spend_usd")
    return 200, {"generated_at": m.get("generated_at"), "fudge": m.get("fudge"), "gnds_version": m.get("gnds_version"),
                 "totals": m.get("totals"),
                 "releases": {rel: {**{k: v.get(k) for k in keep},
                                    "sublibraries": {s: {k: d.get(k) for k in ("materials", "converted", "failed",
                                                                               "not_attempted", "bytes")}
                                                     for s, d in v.get("sublibraries", {}).items()}}
                              for rel, v in m.get("releases", {}).items()}}


def route(path, q):
    q = q or {}
    p = path.rstrip("/")
    try:
        if p == "/gnds":
            return find(q)
        if p == "/gnds/releases":
            return releases()
        return 404, {"error": "routes: /gnds?release=&name=&sub=, /gnds/releases"}
    except ValueError as e:
        return 400, {"error": str(e)[:500]}
