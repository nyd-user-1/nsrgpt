"""Brief 70: the libraries JANIS lists that the lake lacks, from the crawl, and what the lake's raw mirrors already hold
for each. Runs on the fill box; writes lake/_work/fill/inventory.json.

  python inventory.py
"""
import collections
import json

import boto3

BUCKET = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")
TREE = "lake/janis/2026-11-10/tree.json"
IAEA = "raw/iaea/2026-11-07/public/download-endf/"


def get(key):
    return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())


def keys(prefix):
    out = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=prefix):
        out += [(o["Key"], o["Size"]) for o in page.get("Contents", [])]
    return out


def main():
    tree = get(TREE)
    libs = collections.defaultdict(list)  # label -> [(category, mark, missing count)]
    for cat in tree.get("children", []):
        code = cat["path"].strip("/").split("/")[0]
        for lib in cat.get("children", []):
            c = lib.get("counts", {})
            libs[lib["label"]].append({"cat": code, "mark": lib.get("mark"), "rule": lib.get("rule"),
                                       "missing": c.get("missing", 0), "same": c.get("same", 0),
                                       "types": [t["label"] for t in lib.get("children", [])]})
    gap = {k: v for k, v in libs.items() if any(x["mark"] == "missing" for x in v)}
    root = tree.get("counts", {})
    # the IAEA mirror's top folders, sized
    by_dir = collections.defaultdict(lambda: [0, 0])
    files = collections.defaultdict(list)
    for k, n in keys(IAEA):
        d = k[len(IAEA):].split("/", 1)[0]
        by_dir[d][0] += 1
        by_dir[d][1] += n
        files[d].append((k[len(IAEA):], n))
    out = {"root_counts": root, "gap_libraries": gap,
           "categories": {c["path"].strip("/").split("/")[0]: {"label": c["label"], "mark": c.get("mark"),
                                                               "rule": c.get("rule"), "counts": c.get("counts")}
                          for c in tree.get("children", [])},
           "iaea_dirs": {d: {"files": v[0], "bytes": v[1]} for d, v in sorted(by_dir.items())},
           "iaea_files": {d: sorted(f) for d, f in files.items()}}
    s3.put_object(Bucket=BUCKET, Key="lake/_work/fill/inventory.json", Body=json.dumps(out).encode())
    print(json.dumps({"root": root, "gap": len(gap)}))
    for name, v in sorted(gap.items()):
        print(name, "|", ",".join(f"{x['cat']}:{x['missing']}" for x in v))
    print("--- iaea dirs")
    for d, v in sorted(by_dir.items()):
        print(d, v[0], v[1])


if __name__ == "__main__":
    main()
