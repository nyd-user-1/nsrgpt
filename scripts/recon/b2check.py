"""Brief 74, B2: for every release, the materials with resolved or unresolved parameters (recon/materials.json, from
recon.py list) against the curves served for Elpis: JANIS's own (<release>-janis), the NJOY reconstruction
(<release>-recon-293.6K) or NNDC's POINT files (<release>-point-293.6K), matched by sublibrary and MAT in each one's
xs_index. Runs on a recon box; writes lake/_work/parse/endfb/recon/b2.json and prints a table.

  b2check.py <release>...
"""
import io
import json
import sys

import boto3
import pyarrow.parquet as pq

B = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")


def index(name):
    try:
        t = pq.read_table(io.BytesIO(s3.get_object(Bucket=B, Key=f"lake/serve/endf/{name}/xs_index/part-00000.parquet")
                                     ["Body"].read()), columns=["sublibrary", "mat"])
        return {(a, b) for a, b in zip(t.column("sublibrary").to_pylist(), t.column("mat").to_pylist())}
    except s3.exceptions.NoSuchKey:
        return None


out = []
for rel in sys.argv[1:]:
    try:
        lst = json.loads(s3.get_object(Bucket=B, Key=f"lake/endfb/{rel}/recon/materials.json")["Body"].read())["materials"]
    except s3.exceptions.NoSuchKey:
        out.append({"release": rel, "listed": None})
        continue
    src = {k: index(f"{rel}-{k}") for k in ("janis", "recon-293.6K", "point-293.6K")}
    row = {"release": rel, "listed": len(lst), "covered": {}, "missing": []}
    for m in lst:
        key = (m["sublibrary"], m["mat"])
        by = next((k for k, s in src.items() if s is not None and key in s), None)
        if by:
            row["covered"][by] = row["covered"].get(by, 0) + 1
        else:
            row["missing"].append(f"{m['name']} ({m['sublibrary']}, MAT {m['mat']})")
    out.append(row)
    print(f"{rel:16s} listed {len(lst):5d}  " + "  ".join(f"{k} {v}" for k, v in row["covered"].items())
          + (f"  missing {len(row['missing'])}: {', '.join(row['missing'][:4])}" if row["missing"] else ""), flush=True)
s3.put_object(Bucket=B, Key="lake/_work/parse/endfb/recon/b2.json", Body=json.dumps(out, indent=1).encode(),
              ContentType="application/json")
