"""Brief 56: File 2 and File 32 per release from each manifest's mf2_mf32 section, as one JSON line per release and the
totals (for INVENTORY.md, lib/pipeline-map.ts and the report).
  /opt/parse/bin/python -I res_summary.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "box"))
import lake  # noqa: E402

RELEASES = ["B-VIII.1", "B-VIII.0", "B-VII.1", "B-VII.0", "B-VI.8", "B-V", "B-IV", "B-III", "B-II",
            "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2"]
tot = {"mf2": 0, "mf32": 0, "rejected": 0, "ranges": 0, "resonances": 0, "cov_rows": 0, "seconds": 0, "athena_usd": 0.0}
for r in RELEASES:
    try:
        m = json.loads(lake.s3.get_object(Bucket=lake.BUCKET, Key=f"lake/endfb/{r}/manifest.json")["Body"].read())
    except Exception:  # noqa: BLE001
        print(json.dumps({"release": r, "manifest": None}))
        continue
    x = m.get("mf2_mf32")
    if not x:
        print(json.dumps({"release": r, "mf2_mf32": None}))
        continue
    t = x["tables"]
    n = lambda k: t[k].get("athena_count", t[k].get("rows"))  # noqa: E731
    row = {"release": r, "mf2": x["sections_parsed"].get("res", 0), "mf2_seen": x["sections_seen"].get("res", 0),
           "mf32": x["sections_parsed"].get("rescov", 0), "mf32_seen": x["sections_seen"].get("rescov", 0),
           "rejected": x["sections_rejected"], "ranges": n("endfb_res_ranges"), "resonances": n("endfb_res_params"),
           "cov_rows": n("endfb_res_cov"), "seconds": x["seconds"],
           "match": {g: c["match"] for g, c in x["counts_check"]["tables_vs_sections"].items()},
           "rejects": [f"{q['file'].rsplit('/', 1)[-1]} MAT {q['mat']} MF{q['mf']}: {q['error'][:90]}" for q in x["rejected"][:5]],
           "athena_usd": x["spend"]["athena_usd"]}
    for k in tot:
        tot[k] += row.get(k) or 0
    print(json.dumps(row))
tot["athena_usd"] = round(tot["athena_usd"], 4)
print(json.dumps({"totals": tot}))
