# Wayback CDX pass (brief 20): which record files the Wayback Machine holds, from the box's own address (no proxy).
# Reads  the CDX API for nds.iaea.org/records/*/files/* and nds.iaea.org/api/records/*/files/*/content, status 200
#        captures, one row per distinct capture (collapse=digest).
# Writes raw/iaea-records/2026-11-08/_index/cdx.json: {"<record-id>/<filename>": [{original, timestamp, length,
#        mimetype}, ...newest first]}, plus the raw CDX rows under _index/cdx-raw-*.json.
#   /opt/pw/bin/python cdx.py
import json, re, time, urllib.parse, urllib.request
from rec import *

UA = "Mozilla/5.0 (X11; Linux x86_64) nsrgpt-archive-fetch"
PATTERNS = {"records": "nds.iaea.org/records/*", "api": "nds.iaea.org/api/records/*"}
FILE = re.compile(r"^/(?:api/)?records/([a-z0-9]{5}-[a-z0-9]{5})/files/(.+?)(?:/content)?$")


def cdx(pattern):
    q = urllib.parse.urlencode([("url", pattern), ("output", "json"), ("fl", "original,timestamp,length,statuscode,mimetype,digest"),
                                ("filter", "statuscode:200"), ("filter", "original:.*/files/.*"), ("collapse", "digest"),
                                ("limit", "500000")])
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(f"https://web.archive.org/cdx/search/cdx?{q}",
                                                               headers={"User-Agent": UA}), timeout=600) as r:
                body = r.read()
            return json.loads(body) if body.strip() else []
        except Exception as e:
            print(f"cdx {pattern}: {e}; retry", flush=True)
            time.sleep(30 * (attempt + 1))
    raise IOError(f"cdx gave up on {pattern}")


out = {}
for tag, pat in PATTERNS.items():
    rows = cdx(pat)
    put(f"{P}/_index/cdx-raw-{tag}.json", json.dumps(rows).encode(), "application/json")
    head, rows = (rows[0], rows[1:]) if rows else ([], [])
    print(f"{pat}: {len(rows)} captures", flush=True)
    for row in rows:
        r = dict(zip(head, row))
        u = urllib.parse.urlsplit(r["original"])
        m = FILE.match(u.path)
        if not m:
            continue
        name = urllib.parse.unquote(m.group(2))
        out.setdefault(f"{m.group(1)}/{name}", []).append(
            {"original": r["original"], "timestamp": r["timestamp"], "length": r["length"], "mimetype": r["mimetype"]})
for k in out:
    out[k].sort(key=lambda c: c["timestamp"], reverse=True)
put_json(f"{P}/_index/cdx.json", out)
print(json.dumps({"files_with_captures": len(out), "captures": sum(len(v) for v in out.values())}))
