# Classifier (brief 20, steps 1 and 3): sorts every record file into paperwork, data, image or video, and splits the
# work into fetch lists by route.
# Reads  raw/iaea-records/2026-11-08/_index/records.jsonl and _index/cdx.json.
# Writes _index/records.tsv (id, created, publication_date, resource_type, title, n_files, bytes, class, wayback_bytes),
#        _index/files.tsv (one row per file), _index/summary.json (counts and bytes by class and route), and the fetch
#        lists _work/lists/{wayback,proxy}-{dxs,paperwork,data}.json.
# A file is paperwork when its extension is one of PAPER and it is under 100 MB; image and video files are skipped;
# everything else is data. A record is data when it holds any data file, otherwise paperwork.
#   /opt/pw/bin/python classify.py
import json
from rec import *


def clean(s):
    return " ".join(str(s or "").split())


recs = [json.loads(l) for l in get(f"{P}/_index/records.jsonl").decode().splitlines() if l.strip()]
cdx = get_json(f"{P}/_index/cdx.json")
files, rrows = [], []
for r in recs:
    md, fl = r.get("metadata") or {}, r.get("files") or {}
    access = (r.get("access") or {}).get("files", "public")
    mine = []
    for name, e in (fl.get("entries") or {}).items():
        ext, size = ext_of(name, e.get("ext")), int(e.get("size") or 0)
        ck = e.get("checksum") or ""
        f = {"id": r["id"], "name": name, "key": f"{P}/{r['id']}/{name}", "size": size,
             "md5": ck[4:] if ck.startswith("md5:") else None, "ext": ext, "class": klass(ext, size), "access": access,
             "url": live_url(r["id"], name),
             "cands": cdx.get(f"{r['id']}/{name}", [])}
        mine.append(f)
    files += mine
    rclass = "data" if any(f["class"] == "data" for f in mine) else "paperwork"
    rrows.append([r["id"], r.get("created", ""), md.get("publication_date", ""), (md.get("resource_type") or {}).get("id", ""),
                  clean(md.get("title")), len(mine), sum(f["size"] for f in mine), rclass,
                  sum(f["size"] for f in mine if f["cands"])])

head = "id\tcreated\tpublication_date\tresource_type\ttitle\tn_files\tbytes\tclass\twayback_bytes"
put(f"{P}/_index/records.tsv", (head + "\n" + "\n".join("\t".join(map(str, x)) for x in rrows) + "\n").encode(), "text/tab-separated-values")
fhead = "id\tname\tsize\tmd5\text\tclass\taccess\twayback_captures\turl"
put(f"{P}/_index/files.tsv", (fhead + "\n" + "\n".join("\t".join(map(str, [f["id"], f["name"], f["size"], f["md5"], f["ext"], f["class"],
    f["access"], len(f["cands"]), f["url"]])) for f in files) + "\n").encode(), "text/tab-separated-values")


def group(f):
    return "dxs" if f["id"] == DXS else f["class"]


lists = {}
for f in files:
    g = group(f)
    if g not in ("dxs", "paperwork", "data") or f["access"] != "public":
        continue
    route = "wayback" if f["cands"] else "proxy"
    lists.setdefault(f"{route}-{g}", []).append(f)
for name, items in lists.items():
    items.sort(key=lambda f: f["size"])  # smallest first
    put_json(f"{W}/lists/{name}.json", {"files": items})


def tally(sel):
    return {"files": len(sel), "bytes": sum(f["size"] for f in sel)}


summary = {"records": len(recs), "records_by_class": {c: sum(1 for x in rrows if x[7] == c) for c in ("paperwork", "data")},
           "records_without_files": sum(1 for x in rrows if x[5] == 0), "files": tally(files),
           "by_class": {}, "restricted": tally([f for f in files if f["access"] != "public"]),
           "no_md5": tally([f for f in files if not f["md5"]]),
           "lists": {k: tally(v) for k, v in sorted(lists.items())},
           "resource_types": {}}
for c in ("paperwork", "data", "image", "video"):
    sel = [f for f in files if f["class"] == c]
    summary["by_class"][c] = dict(tally(sel), wayback=tally([f for f in sel if f["cands"]]),
                                  not_in_wayback=tally([f for f in sel if not f["cands"]]))
summary["dxs"] = [{k: f[k] for k in ("name", "size", "md5")} | {"wayback_captures": len(f["cands"])} for f in files if f["id"] == DXS]
for x in rrows:
    summary["resource_types"][x[3]] = summary["resource_types"].get(x[3], 0) + 1
put_json(f"{P}/_index/summary.json", summary)
print(json.dumps(summary, indent=1))
