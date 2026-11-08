# Manifest (brief 20): raw/iaea-records/2026-11-08/manifest.json in brief 14's shape, from the index and every fetch run.
# Reads  _index/records.jsonl, _index/cdx.json, _index/summary.json, _work/<run>/results.jsonl for every wayback-* and
#        proxy-* run, _work/meter.json, and an optional spend JSON (S3 key) written from scripts/iaea/spend.json.
# Writes raw/iaea-records/2026-11-08/manifest.json: records and their class split; files taken, each with url, key,
#        size, md5, route (wayback with its snapshot timestamp, or proxy); not_taken with reasons and sizes.
#   /opt/pw/bin/python manifest.py [spend-key]
import json, re, sys, time
from rec import *

recs = [json.loads(l) for l in get(f"{P}/_index/records.jsonl").decode().splitlines() if l.strip()]
summary = get_json(f"{P}/_index/summary.json")
cdx = get_json(f"{P}/_index/cdx.json")
runs = sorted({o["Key"].split("/")[-2] for page in s3.get_paginator("list_objects_v2").paginate(Bucket=B, Prefix=f"{W}/")
               for o in page.get("Contents", []) if o["Key"].endswith("/results.jsonl")
               and o["Key"].split("/")[-2].startswith(("wayback-", "proxy-"))})
rows = {}
for run in runs:
    for l in get(f"{W}/{run}/results.jsonl").decode().splitlines():
        if l.strip():
            r = json.loads(l)
            r["run"] = run
            rows.setdefault(r["key"], []).append(r)



def snapshot_of(key):
    # a file uploaded by a run that was stopped before it saved its row: the snapshot is in the object's metadata
    try:
        w = s3.head_object(Bucket=B, Key=key)["Metadata"].get("wayback", "")
        return re.search(r"/web/(\d{14})id_/", w).group(1)
    except Exception:
        return None


files, not_taken = [], []
for rec in recs:
    access = (rec.get("access") or {}).get("files", "public")
    for name, e in ((rec.get("files") or {}).get("entries") or {}).items():
        size, ext = int(e.get("size") or 0), ext_of(name, e.get("ext"))
        c = "dxs" if rec["id"] == DXS else klass(ext, size)
        ck = e.get("checksum") or ""
        key = f"{P}/{rec['id']}/{name}"
        url = live_url(rec["id"], name)
        base = {"url": url, "key": key, "size": size, "md5": ck[4:] if ck.startswith("md5:") else None}
        mine = rows.get(key, [])
        done = sorted([r for r in mine if r["status"] in ("done", "skipped")], key=lambda r: r["status"] != "done")
        if done:
            r = done[0]
            f = dict(base, route=r["route"])
            if r["route"] == "wayback":
                f["snapshot"] = r.get("snapshot") or snapshot_of(key)
            files.append({k: v for k, v in f.items() if v is not None})
            continue
        if c in ("image", "video"):
            reason = f"{c}, skipped"
        elif access != "public":
            reason = f"restricted (access.files = {access})"
        else:
            notes = []
            if any(r["status"] == "mismatch" for r in mine):
                notes.append("wayback mismatch")
            errs = [r.get("error") for r in mine if r["status"] == "error" and r["route"] == "proxy"]
            if c == "data":
                notes.append("deferred: data, proxy budget (2026-11-08)")
            elif any(r["status"] == "deferred" for r in mine) or not mine:
                notes.append(f"deferred: {'paperwork' if c == 'paperwork' else 'DXS-2026'}, proxy budget (2026-11-08)")
            elif errs:
                notes.append(f"proxy error: {errs[0]}")
            reason = "; ".join(notes)
        not_taken.append({"url": url, "key": key, "size": size, "class": c, "reason": reason,
                          "wayback_captures": len(cdx.get(f"{rec['id']}/{name}", []))})

by_route = {}
for f in files:
    br = by_route.setdefault(f["route"], {"files": 0, "bytes": 0})
    br["files"] += 1
    br["bytes"] += f["size"]
reasons = {}
for n in not_taken:
    rr = reasons.setdefault(n["reason"], {"files": 0, "bytes": 0})
    rr["files"] += 1
    rr["bytes"] += n["size"]
try:
    meter = get_json(f"{W}/meter.json")
except Exception:
    meter = None
m = {"source": "iaea-records", "prefix": P, "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
     "site": "https://nds.iaea.org/records/ (Invenio RDM)",
     "how": "scripts/iaea/records/ in nsrgpt: index.py (the API through real Chrome on a Webshare line), cdx.py and "
            "wayback.py (Wayback id_ replay from the box's own address, size and md5 checked before upload), proxy.py "
            "(real Chrome, smallest first, inside the 5.0 GB proxy cap counted by meter.sh)",
     "rules": {"paperwork": "extension pdf doc docx ppt pptx xls xlsx csv txt md rtf odt odp html htm, under 100 MB",
               "image_video": "skipped", "data": "everything else; taken from the Wayback Machine only (DXS-2026 also by proxy)",
               "record_class": "data when the record holds any data file, otherwise paperwork"},
     "records": len(recs), "records_by_class": summary["records_by_class"],
     "index": {"records_jsonl": f"{P}/_index/records.jsonl", "records_tsv": f"{P}/_index/records.tsv",
               "files_tsv": f"{P}/_index/files.tsv", "cdx": f"{P}/_index/cdx.json", "pages": f"{P}/_index/pages/"},
     "counts": {"files_in_records": len(files) + len(not_taken), "files": len(files), "bytes": sum(f["size"] for f in files),
                "by_route": by_route, "not_taken": len(not_taken), "not_taken_by_reason": reasons},
     "proxy_meter": meter, "files": files, "not_taken": not_taken}
if len(sys.argv) > 1:
    m["spend"] = get_json(sys.argv[1])
put_json(f"{P}/manifest.json", m)
print(json.dumps({k: m[k] for k in ("records", "records_by_class", "counts", "proxy_meter")}, indent=1))
