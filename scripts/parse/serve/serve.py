# Build the EXFOR serving tables in Athena with UNLOAD + CREATE EXTERNAL TABLE (brief 16, step 4; CTAS with a location
# is refused by workgroup nsrgpt, which enforces its output location). Runs on the parse box, from a copy of this
# folder at /opt/nsr/scripts/serve/ beside the exfor scripts (common.py):
#   serve.py [table …]    run ddl/<table>.sql for each (default: search_index, targets, reactions, quantities):
#                         clear its folder, UNLOAD, register, count; then lake/serve/exfor/<version>/manifest.json
import sys, os, re, json
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(here))
from common import *
import pyarrow.parquet as pq

VERSION = "2026-10-28"
ORDER = ["search_index", "targets", "reactions", "quantities"]


def build(name):
    """UNLOAD the SELECT to the table's folder, then register it from the Parquet schema (common.register)."""
    sql = open(f"{here}/ddl/{name}.sql").read()
    table = f"exfor_serve_{name}"
    loc = re.search(r"\) TO 's3://[^/]+/([^']+)'", sql).group(1)
    assert loc.startswith(f"lake/serve/exfor/{VERSION}/"), loc
    clear(loc)
    body = "\n".join(l for l in sql.splitlines() if not l.startswith("--")).strip().rstrip(";")
    _, _, stats = query(body)
    objs = [o for p in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=loc) for o in p.get("Contents", [])]
    first = f"/data/tmp/serve-{name}.parquet"
    s3.download_file(BUCKET, objs[0]["Key"], first)
    schema = pq.read_schema(first)
    register(table, loc, schema, f"EXFOR serving table {name} ({VERSION})")
    _, rows, _ = query(f'SELECT count(*) FROM "{table}"')
    r = {"name": name, "athena_table": f"nsr.{table}", "location": loc, "rows": int(rows[0][0]),
         "bytes": sum(o["Size"] for o in objs), "files": len(objs),
         "columns": [{"name": f.name, "type": athena_type(f.type)} for f in schema],
         "unload_scanned_bytes": stats.get("DataScannedInBytes"), "unload_ms": stats.get("TotalExecutionTimeInMillis"),
         "sql": f"scripts/parse/serve/ddl/{name}.sql", "table_ddl": f"scripts/parse/serve/ddl/{name}.table.sql"}
    log("built", table, r["rows"], r["bytes"], r["unload_scanned_bytes"])
    return r


if __name__ == "__main__":
    names = sys.argv[1:] or ORDER
    mpath = f"lake/serve/exfor/{VERSION}/manifest.json"
    try:
        m = json.loads(s3.get_object(Bucket=BUCKET, Key=mpath)["Body"].read())
    except Exception:
        m = {"folder": f"lake/serve/exfor/{VERSION}/", "sources": ["nsr.exfor_j4_* (J4 2026-10-28)",
             "nsr.exfor_dict_* (exfor_dictionary latest.json)", "nsr.exfor_c5_datasets (C5 2023-08-28)"],
             "tables": {}}
    for n in names:
        m["tables"][n] = build(n)
    scanned = sum(t.get("unload_scanned_bytes") or 0 for t in m["tables"].values())
    m["built_at"] = now()
    m["spend"] = {"athena_scanned_bytes": scanned, "athena_usd": round(scanned / 1e12 * 5, 4),
                  "s3": "under 0.1 GB stored"}
    put_json(mpath, m)
    print(json.dumps({k: (v["rows"], v["bytes"]) for k, v in m["tables"].items()}))
