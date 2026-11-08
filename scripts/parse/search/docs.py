# Build nsr.search_docs (brief 18): UNLOAD docs.sql to lake/serve/search/2026-11-08/docs/, register it from the Parquet
# schema, count rows per type. Runs on the parse box from /opt/nsr/scripts/search/, beside the exfor scripts (common.py).
#   docs.py
import sys, os, re, json
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(here))
from common import *
import pyarrow.parquet as pq

VERSION = "2026-11-08"
LOC = f"lake/serve/search/{VERSION}/docs"

if __name__ == "__main__":
    sql = open(f"{here}/docs.sql").read()
    body = "\n".join(l for l in sql.splitlines() if not l.startswith("--")).strip().rstrip(";")
    clear(LOC + "/")
    _, _, stats = query(body)
    objs = [o for p in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=LOC + "/") for o in p.get("Contents", [])]
    s3.download_file(BUCKET, objs[0]["Key"], "/data/tmp/docs-0.parquet")
    schema = pq.read_schema("/data/tmp/docs-0.parquet")
    register("search_docs", LOC, schema, f"Search documents, parsing-2 share ({VERSION})")
    _, rows, _ = query("SELECT type, count(*), sum(length(text)) FROM search_docs GROUP BY 1 ORDER BY 1")
    st = {"table": "nsr.search_docs", "location": LOC, "files": len(objs), "bytes": sum(o["Size"] for o in objs),
          "rows_by_type": {r[0]: int(r[1]) for r in rows}, "text_chars_by_type": {r[0]: int(r[2] or 0) for r in rows},
          "unload_scanned_bytes": stats.get("DataScannedInBytes"), "unload_ms": stats.get("TotalExecutionTimeInMillis"),
          "columns": [{"name": f.name, "type": athena_type(f.type)} for f in schema], "built_at": now()}
    os.makedirs("/data/state", exist_ok=True)
    json.dump(st, open("/data/state/search-docs.json", "w"), indent=1)
    put_json(f"lake/_work/parse/search/state/search-docs.json", st)
    print(json.dumps({k: st[k] for k in ("rows_by_type", "bytes", "files", "unload_scanned_bytes")}))
