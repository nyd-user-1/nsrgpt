"""Brief 70: one line per release added tonight, read from its manifest (parts A, B, C and Files 4-15), written to
lake/_raw/PROGRESS.json for the lead to read in one call, and printed as report lines.

  python progress.py [--lines]
"""
import json
import sys
import time

import boto3

BUCKET = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")
HELD13 = {"B-VIII.1", "B-VIII.0", "B-VII.1", "B-VII.0", "B-VI.8", "B-V", "B-IV", "B-III", "B-II", "JEFF-3.3", "JENDL-5",
          "TENDL-2023", "CENDL-3.2", "_values"}


def get(key):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    except Exception:  # noqa: BLE001
        return None


def releases():
    out = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix="lake/endfb/", Delimiter="/"):
        out += [p["Prefix"].split("/")[2] for p in page.get("CommonPrefixes", [])]
    return [r for r in out if r not in HELD13 and "-point-" not in r]


def row(rel):
    m = get(f"lake/endfb/{rel}/manifest.json") or {}
    if not m.get("tables"):
        return None
    t = m.get("tables", {})
    cnt = lambda k: (t.get(k) or {}).get("athena_count")  # noqa: E731
    src = m.get("source") if isinstance(m.get("source"), dict) else {}
    b = m.get("mf8_mf33") or {}
    c = m.get("mf2_mf32") or {}
    f = m.get("mf4_15") or {}
    sp = (f.get("spend") or {})
    usd = round((sp.get("lambda_usd_parse") or 0) + (sp.get("athena_usd") or 0) + ((m.get("spend") or {}).get("athena_usd") or 0)
                + ((b.get("spend") or {}).get("athena_usd") or 0) + ((c.get("spend") or {}).get("athena_usd") or 0), 2)
    secs = (m.get("seconds") or 0) + (b.get("seconds") or 0) + (c.get("seconds") or 0)
    ft = f.get("timings") or {}
    tabs = [k for k in t if (t[k] or {}).get("athena_count")]
    tabs += [k for k in (b.get("tables") or {}) if ((b["tables"][k] or {}).get("athena_count") or (b["tables"][k] or {}).get("rows"))]
    tabs += [k for k in (c.get("tables") or {}) if ((c["tables"][k] or {}).get("athena_count") or (c["tables"][k] or {}).get("rows"))]
    nv = f.get("total_values") or 0
    tabs += [f"endfb_{x}" for x in ("ang", "edist", "eang", "mult", "photon_xs", "photon_ang", "photon_edist")
             if any(str(mf) in (f.get("values_by_mf") or {}) for mf in {"ang": [4], "edist": [5], "eang": [6], "mult": [9, 10],
                                                                         "photon_xs": [12, 13], "photon_ang": [14], "photon_edist": [15]}[x])]
    return {
        "release": rel, "bytes": src.get("bytes"), "files": src.get("files_read"),
        "archives": len(src.get("archives") or []), "materials": cnt("endfb_materials"),
        "by_sublibrary": (m.get("counts_check") or {}).get("tables_by_sublibrary"),
        "matches_reference": ((m.get("counts_check") or {}).get("match_reference") or {}).get("materials"),
        "sections": cnt("endfb_sections"), "xs_points": cnt("endfb_xs_points"), "records": cnt("endfb_records"),
        "part_b": bool(b), "part_c": bool(c), "files_4_15_values": nv, "files_4_15": bool(f),
        "tables": sorted(set(tabs)), "box_minutes": round(secs / 60, 1),
        "lambda_minutes_wall": None if not ft else ft.get("last_summary"), "usd": usd,
    }


def main():
    rows = [x for x in (row(r) for r in sorted(releases())) if x]
    body = {"updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "by": "elpis-fill (brief 70)",
            "releases": rows, "done": [r["release"] for r in rows if r["part_b"] and r["part_c"] and r["files_4_15"]]}
    old = get("lake/_raw/PROGRESS.json") or {}
    body["fetch"] = old.get("fetch", {})
    s3.put_object(Bucket=BUCKET, Key="lake/_raw/PROGRESS.json", Body=json.dumps(body, indent=1).encode(),
                  ContentType="application/json")
    if "--lines" in sys.argv:
        for r in rows:
            gb = (r["bytes"] or 0) / 1e9
            print(f"{r['release']}: {gb:.2f} GB, {r['files']} files, {r['materials']} materials "
                  f"({'matches' if r['matches_reference'] else 'CHECK'}), {len(r['tables'])} tables, "
                  f"{r['files_4_15_values']:,} File 4-15 values, {r['box_minutes']} box-min, ${r['usd']}; "
                  f"B {'y' if r['part_b'] else 'n'} C {'y' if r['part_c'] else 'n'} F {'y' if r['files_4_15'] else 'n'}")


if __name__ == "__main__":
    main()
