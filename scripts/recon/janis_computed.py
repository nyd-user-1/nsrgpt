"""Brief 74, B5: the rows JANIS computes that <release>-janis serves where File 3 has none (MT 4 as Sum(MT50-91)), for
scripts/elpis/book-index.mjs. Runs on a recon box; reads each -janis xs_index, writes
lake/_work/parse/endfb/recon/janis-computed.json (the box role cannot write lake/elpis/; copy it there from the Mac).

  janis_computed.py <release>...
"""
import io
import json
import sys

import boto3
import pyarrow.parquet as pq

B = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")
out = []
for rel in sys.argv[1:]:
    try:
        t = pq.read_table(io.BytesIO(s3.get_object(Bucket=B, Key=f"lake/serve/endf/{rel}-janis/xs_index/part-00000.parquet")
                                     ["Body"].read()))
    except s3.exceptions.NoSuchKey:
        continue
    if "computed" not in t.column_names:
        print(json.dumps({"release": rel, "note": "served before the computed column; re-serve"}), flush=True)
        continue
    for r in t.select(["sublibrary", "za", "liso", "mt", "computed"]).to_pylist():
        if r["computed"]:
            out.append({"release": rel, "sub": r["sublibrary"], "za": int(r["za"]), "liso": int(r["liso"] or 0),
                        "mt": r["mt"], "computed": r["computed"]})
s3.put_object(Bucket=B, Key="lake/_work/parse/endfb/recon/janis-computed.json", Body=json.dumps(out).encode(), ContentType="application/json")
by = {}
for r in out:
    by[(r["release"], r["sub"])] = by.get((r["release"], r["sub"]), 0) + 1
print(json.dumps({"rows": len(out), "by": {f"{a} {b}": n for (a, b), n in sorted(by.items())}}))
