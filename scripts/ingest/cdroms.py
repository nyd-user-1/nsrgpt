"""Brief 62 Part B.5: IAEA's CD-ROM collection (nds.iaea.org/cdroms) listed as a table, on the ingest box.
  node cdroms.js /data/cd/cd-catalog.js > /data/cd/catalog.json && /opt/ingest/venv/bin/python -I cdroms.py
nds.iaea.org answers a Cloudflare challenge to a plain client (2026-11-10). The page's catalog script and every
download it lists were mirrored on 2026-11-07 (raw/iaea/2026-11-07/cdroms/: cd-catalog.js, dwn/ with 51 files, doc/).
cdroms.js evaluates the catalog as the page does; this writes one row per product file to nsr.iaea_cdroms
(lake/iaea-cdroms/2026-11-07/): product, title, issued, year, description, file, the catalog's size label, held (in
dwn/), held bytes and key. Manifest raw/iaea/2026-11-11/cdroms/manifest.json."""
import datetime
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lake  # noqa: E402
import pyarrow as pa  # noqa: E402
import pyarrow.parquet as pq  # noqa: E402

HELD = "raw/iaea/2026-11-07/cdroms"
LAKE = "lake/iaea-cdroms/2026-11-07"
LOCAL = "/data/cd"
S, I, L, B = pa.string(), pa.int32(), pa.int64(), pa.bool_()
SCHEMA = pa.schema([("product", S), ("title", S), ("issued", S), ("year", I), ("description", S), ("file", S),
                    ("size_label", S), ("held", B), ("held_bytes", L), ("held_key", S)])


def text(s):
    s = re.sub(r"<br\s*/?>|<div[^>]*>", " ", s or "")
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    return re.sub(r"\s+", " ", s).strip() or None


def main():
    held = {}
    for page in lake.s3.get_paginator("list_objects_v2").paginate(Bucket=lake.BUCKET, Prefix=f"{HELD}/dwn/"):
        for o in page.get("Contents", []):
            held[o["Key"].rsplit("/", 1)[1]] = o
    rows = []
    for p in json.load(open(f"{LOCAL}/catalog.json")):
        issued = text(p.get("issued"))
        year = re.search(r"(19|20)\d\d", issued or "")
        for k in ("", "2", "3", "4", "5"):
            f = (p.get(f"downloadFile{k}") or "").strip()
            if not f:
                continue
            o = held.get(f.rsplit("/", 1)[-1])
            rows.append([p.get("id"), text(p.get("name")), issued, int(year.group(0)) if year else None,
                         text(p.get("comment")), f, text(p.get(f"lfile{k}")), o is not None,
                         o["Size"] if o else None, o["Key"] if o else None])
    t = pa.Table.from_arrays([pa.array([r[i] for r in rows], type=f.type) for i, f in enumerate(SCHEMA)], schema=SCHEMA)
    os.makedirs(f"{LOCAL}/out", exist_ok=True)
    pq.write_table(t, f"{LOCAL}/out/part-00000.parquet", compression="snappy")
    lake.sync(f"{LOCAL}/out", f"{LAKE}/files/")
    count, _ = lake.register("iaea_cdroms", SCHEMA, f"s3://{lake.BUCKET}/{LAKE}/files/", "/opt/ingest/ddl")
    for f in os.listdir("/opt/ingest/ddl"):
        lake.s3.upload_file(f"/opt/ingest/ddl/{f}", lake.BUCKET, f"lake/_work/ingest/ddl/{f}")
    listed = {r[5].rsplit("/", 1)[-1] for r in rows}
    out = {"source": "IAEA NDS CD-ROMs and downloads, https://nds.iaea.org/cdroms/ (catalog cd-catalog.js)",
           "built_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "why_held": "nds.iaea.org answered a Cloudflare challenge to a plain client on 2026-11-10",
           "terms": "IAEA Terms of Use (https://www.iaea.org/about/terms-of-use)",
           "products": len({r[0] for r in rows}), "files_listed": len(rows), "files_held": sum(1 for r in rows if r[7]),
           "bytes_held": sum(r[8] or 0 for r in rows), "listed_not_held": [r[5] for r in rows if not r[7]],
           "held_not_listed": sorted(set(held) - listed),
           "table": {"name": "nsr.iaea_cdroms", "rows": t.num_rows, "athena_count": count, "location": f"{LAKE}/files/"}}
    lake.put_json("raw/iaea/2026-11-11/cdroms/manifest.json", out)
    print(out)


if __name__ == "__main__":
    main()
