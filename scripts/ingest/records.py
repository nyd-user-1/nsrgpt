"""Brief 62 Part B.4: IAEA's records repository (nds.iaea.org/records, InvenioRDM) as tables, on the ingest box.
  /opt/ingest/venv/bin/python -I records.py
The repository's API answers a Cloudflare challenge to a plain client (2026-11-10), so the catalog is the index held
since 2026-11-08 (raw/iaea-records/2026-11-08/_index/records.jsonl, all 6,810 records as the API served them, and
files.tsv), joined to what the lake holds under raw/iaea-records/2026-11-08/<id>/.
- nsr.iaea_records (lake/iaea-records/2026-11-08/records/): id, doi, title, publication_date, year, resource_type,
  creators, n_files, bytes, held_files, held_bytes, url.
- nsr.iaea_record_files (…/files/): id, name, size, md5, ext, class, access, wayback_captures, held, held_key, url.
Manifest raw/iaea/2026-11-11/records/manifest.json: counts, and the files not held by class, size and Wayback."""
import csv
import datetime
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lake  # noqa: E402
import pyarrow as pa  # noqa: E402
import pyarrow.parquet as pq  # noqa: E402

HELD = "raw/iaea-records/2026-11-08"
LAKE = "lake/iaea-records/2026-11-08"
LOCAL = "/data/rec"
S, I, L, B = pa.string(), pa.int32(), pa.int64(), pa.bool_()
REC = pa.schema([("id", S), ("doi", S), ("title", S), ("publication_date", S), ("year", I), ("resource_type", S),
                 ("creators", S), ("n_files", I), ("bytes", L), ("held_files", I), ("held_bytes", L), ("url", S)])
FIL = pa.schema([("id", S), ("name", S), ("size", L), ("md5", S), ("ext", S), ("class", S), ("access", S),
                 ("wayback_captures", I), ("held", B), ("held_key", S), ("url", S)])


def doi_of(r):
    d = (r.get("pids") or {}).get("doi", {}).get("identifier")
    if d:
        return d
    for i in (r.get("metadata") or {}).get("identifiers") or []:
        if (i.get("scheme") or "").lower() == "doi":
            return i.get("identifier")
    return None


def write(name, schema, rows, table):
    t = pa.Table.from_arrays([pa.array([r[i] for r in rows], type=f.type) for i, f in enumerate(schema)], schema=schema)
    os.makedirs(f"{LOCAL}/out/{name}", exist_ok=True)
    pq.write_table(t, f"{LOCAL}/out/{name}/part-00000.parquet", compression="snappy")
    lake.sync(f"{LOCAL}/out/{name}", f"{LAKE}/{name}/")
    count, _ = lake.register(table, schema, f"s3://{lake.BUCKET}/{LAKE}/{name}/", "/opt/ingest/ddl")
    return {"rows": t.num_rows, "athena_count": count, "location": f"{LAKE}/{name}/"}


def main():
    t0 = time.time()
    for f in ("records.jsonl", "files.tsv"):
        lake.download(f"{HELD}/_index/{f}", f"{LOCAL}/{f}")
    held = {}
    for page in lake.s3.get_paginator("list_objects_v2").paginate(Bucket=lake.BUCKET, Prefix=f"{HELD}/"):
        for o in page.get("Contents", []):
            parts = o["Key"][len(HELD) + 1:].split("/", 1)
            if len(parts) == 2 and not parts[0].startswith("_"):
                held[(parts[0], parts[1])] = o
    files = []
    with open(f"{LOCAL}/files.tsv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            o = held.get((r["id"], r["name"]))
            files.append([r["id"], r["name"], int(r["size"] or 0), r["md5"] or None, r["ext"] or None, r["class"] or None,
                          r["access"] or None, int(r["wayback_captures"] or 0), o is not None,
                          o["Key"] if o else None, r["url"] or None])
    by_rec = {}
    for fr in files:
        h = by_rec.setdefault(fr[0], [0, 0])
        if fr[8]:
            h[0] += 1
            h[1] += held[(fr[0], fr[1])]["Size"]
    recs = []
    with open(f"{LOCAL}/records.jsonl", encoding="utf-8") as f:
        for ln in f:
            r = json.loads(ln)
            m = r.get("metadata") or {}
            names = [((c.get("person_or_org") or {}).get("name") or "") for c in (m.get("creators") or [])]
            pd = m.get("publication_date") or ""
            fl = r.get("files") or {}
            h = by_rec.get(r["id"], [0, 0])
            recs.append([r["id"], doi_of(r), m.get("title"), pd or None, int(pd[:4]) if pd[:4].isdigit() else None,
                         (m.get("resource_type") or {}).get("id"), "; ".join(n for n in names[:8] if n) or None,
                         fl.get("count"), fl.get("total_bytes"), h[0], h[1], f"https://nds.iaea.org/records/{r['id']}"])
    tables = {"nsr.iaea_records": write("records", REC, recs, "iaea_records"),
              "nsr.iaea_record_files": write("files", FIL, files, "iaea_record_files")}
    missing = [fr for fr in files if not fr[8]]
    summary = {}
    for fr in missing:
        k = f"{fr[5]}, {'under' if fr[2] < 1 << 30 else 'over'} 1 GB, {'in' if fr[7] else 'not in'} Wayback"
        s = summary.setdefault(k, {"files": 0, "bytes": 0})
        s["files"] += 1
        s["bytes"] += fr[2]
    for f in os.listdir("/opt/ingest/ddl"):
        lake.s3.upload_file(f"/opt/ingest/ddl/{f}", lake.BUCKET, f"lake/_work/ingest/ddl/{f}")
    out = {"source": "IAEA NDS records repository (InvenioRDM), https://nds.iaea.org/records",
           "built_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "index": f"{HELD}/_index/records.jsonl (served by the API on 2026-11-08)",
           "why_held_index": "the API answered a Cloudflare challenge to a plain client on 2026-11-10",
           "records": len(recs), "with_doi": sum(1 for r in recs if r[1]), "files": len(files),
           "files_held": len(files) - len(missing), "bytes_held": sum(fr[2] for fr in files if fr[8]),
           "not_held": dict(sorted(summary.items())), "tables": tables, "seconds": round(time.time() - t0, 1)}
    lake.put_json("raw/iaea/2026-11-11/records/manifest.json", out)
    print(out)


if __name__ == "__main__":
    main()
