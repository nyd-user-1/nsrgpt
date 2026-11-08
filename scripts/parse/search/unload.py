# UNLOAD one search serving table and register it (brief 18): <name>.sql -> lake/serve/search/2026-11-08/<name>/,
# nsr.search_<name>. Runs on the parse box from /opt/nsr/scripts/search/.
#   unload.py <name>
import sys, os, re, json
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(here))
from common import *
import pyarrow.parquet as pq

name = sys.argv[1]
sql = open(f"{here}/{name}.sql").read()
loc = re.search(r"\) TO 's3://[^/]+/([^']+)'", sql).group(1).rstrip("/")
assert loc.startswith("lake/serve/search/"), loc
body = "\n".join(l for l in sql.splitlines() if not l.startswith("--")).strip().rstrip(";")
clear(loc + "/")
_, _, stats = query(body)
objs = [o for p in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=loc + "/") for o in p.get("Contents", [])]
s3.download_file(BUCKET, objs[0]["Key"], f"/data/tmp/{name}-0.parquet")
schema = pq.read_schema(f"/data/tmp/{name}-0.parquet")
register(f"search_{name}", loc, schema, f"Search serving table {name}")
_, rows, _ = query(f'SELECT count(*) FROM "search_{name}"')
st = {"table": f"nsr.search_{name}", "location": loc, "rows": int(rows[0][0]), "files": len(objs),
      "bytes": sum(o["Size"] for o in objs), "unload_scanned_bytes": stats.get("DataScannedInBytes"),
      "columns": [{"name": f.name, "type": athena_type(f.type)} for f in schema], "built_at": now()}
put_json(f"lake/_work/parse/search/state/search-{name}.json", st)
print(json.dumps({k: st[k] for k in ("table", "rows", "files", "bytes", "unload_scanned_bytes")}))
