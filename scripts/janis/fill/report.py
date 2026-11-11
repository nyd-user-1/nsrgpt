"""Brief 70: the report table, one row per release added (and per library held as files): library | source URL | bytes |
files | tables | materials | minutes | spend | mark. Reads lake/_raw/PROGRESS.json, each release's first archive's
source URL (S3 metadata, else the IAEA path it mirrors) and the marked tree (lake/janis/current/index.json) for the
JANIS row's mark and what is still missing beneath it. Prints markdown.

  python report.py
"""
import json

import boto3

BUCKET = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")
IAEA = "https://www-nds.iaea.org/public/download-endf/"


def get(key):
    return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())


def lake_name(label):
    return label.strip().replace("ENDF/B-", "B-").replace("/", "-").replace(" ", "-")


def source(key):
    key = key.split("#")[0]
    for pre in ("raw/iaea/2026-11-07/public/download-endf/", "lake/_raw/iaea/public/download-endf/"):
        if key.startswith(pre):
            rest = key[len(pre):]
            return IAEA + (rest.rsplit("/", 1)[0] + "/" if rest.count("/") > 1 else rest)
    try:
        return s3.head_object(Bucket=BUCKET, Key=key).get("Metadata", {}).get("source-url", "")
    except Exception:  # noqa: BLE001
        return ""


def marks():
    """lake release name -> [(category label, mark, missing beneath)] from the marked tree's index."""
    idx = get("lake/janis/current/index.json")
    out = {}
    for cat in idx.get("children", []):
        for lib in cat.get("children", []):
            name = lib["label"]
            key = lake_name(name[4:]) + " (TSL)" if name.startswith("TSL ") else lake_name(name)
            out.setdefault(key, []).append((cat["label"].replace("Incident ", "").replace(" data", ""), lib.get("mark"),
                                            (lib.get("counts") or {}).get("missing", 0), lib.get("format"), lib.get("note")))
    return out


def fmt_mark(rows):
    if not rows:
        return "not a JANIS row"
    return "; ".join(f"{c}: {'✓' if m == 'same' else '❌' if m == 'missing' else m}"
                     + (f" ({n:,} rows still ❌ beneath)" if n else "") + (f", files: {f}" if f else "") + (f", {nt}" if nt else "")
                     for c, m, n, f, nt in rows)


def main():
    prog = get("lake/_raw/PROGRESS.json")
    mk = marks()
    print("| library | source URL | bytes | files | tables | materials | minutes | spend | mark |")
    print("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for r in prog["releases"]:
        m = get(f"lake/endfb/{r['release']}/manifest.json")
        arch = ((m.get("source") or {}).get("archives") or [{}])
        url = source(arch[0].get("key", "")) if arch and arch[0] else ""
        rows = mk.get(r["release"], []) + mk.get(r["release"] + " (TSL)", [])
        print(f"| {r['release']} | {url} | {r['bytes'] or 0:,} | {r['files']} | {len(r['tables'])} | {r['materials']:,} | "
              f"{r['box_minutes']} | ${r['usd']} | {fmt_mark(rows)} |")
    for lib, key in [("Nubase 2016", "lake/_raw/Nubase-2016/nubase2016.txt"), ("Nubase 2003", "lake/_raw/Nubase-2003/nubtab03.asc"),
                     ("Nubase 1997", "lake/_raw/Nubase-1997/nubtab97.asc"), ("EAF-2007", "lake/_raw/EAF-2007/eaf_n_xs_20070.zip")]:
        try:
            n = s3.head_object(Bucket=BUCKET, Key=key)["ContentLength"]
        except Exception:  # noqa: BLE001
            continue
        print(f"| {lib} | {source(key)} | {n:,} | 1 | held as files | — | — | $0 | {fmt_mark(mk.get(lake_name(lib), []))} |")


if __name__ == "__main__":
    main()
