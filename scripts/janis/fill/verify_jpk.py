"""Brief 73: every JANIS package (lake/_raw/janis-data/, NEA GitLab janis/data) against the lake's own parse of the same
library, by materials per sublibrary and by sections outside MF3 (neutron MF3 in a package is JANIS's processed data, so
its MF3 counts differ by design; see scripts/janis/README.md). Only each package's zip directory is read (ranged S3
reads), no package is downloaded. The lake side is one Athena query over nsr.endfb_sections.

  python verify_jpk.py [--out=lake/_work/fill/a73/verify-jpk.json]
Writes the result table (release, sublibrary, materials and non-MF3 sections in each, per-MF differences, verdict) as
JSON and prints a line per release and sublibrary.
"""
import collections
import json
import sys
import time
import zipfile

import boto3

B = "nsr-lake-613473203863"
PRE = "lake/_raw/janis-data/"
s3 = boto3.client("s3", region_name="us-east-2")
athena = boto3.client("athena", region_name="us-east-2")
OUT = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--out=")), "lake/_work/fill/a73/verify-jpk.json")

NSUB = {0: "gammas", 3: "photoat", 4: "decay", 5: "sfy", 6: "atomic_relax", 10: "neutrons", 11: "nfy", 12: "thermal_scatt",
        19: "standards", 113: "electrons", 10010: "protons", 10020: "deuterons", 10030: "tritons", 20030: "helium3s",
        20040: "alphas"}
# package NAME/VERSION -> the lake's release name (JANIS's label with "ENDF/" dropped, slashes and spaces to hyphens)
SPECIAL = {("ENDFB", "8.0"): "B-VIII.0", ("ENDFB", "7.1"): "B-VII.1", ("ENDFB", "7.0"): "B-VII.0", ("ENDFB", "6.8"): "B-VI.8",
           ("ENDFB", "6.8-HE"): "B-VI.8-HE", ("JENDL", "5.0"): "JENDL-5", ("IRDFF", "2.0"): "IRDFF-II",
           ("JENDL", "FPDD-2000"): "JENDL-FPD-2000", ("IAEA-PD", "2019"): "IAEA-PD-2019", ("RUSFOND", "2010"): "RUSFOND-2010"}


def release_of(name, ver):
    if (name, ver) in SPECIAL:
        return SPECIAL[(name, ver)]
    if name == "TSL":
        return None  # thermal-scattering packages: their rows are the thermal_scatt sublibraries of the named release
    return f"{name}-{ver}"


class S3File:
    """A seekable read-only file over an S3 object (ranged GETs), so zipfile reads only the central directory."""

    def __init__(self, key):
        self.key, self.pos = key, 0
        self.size = s3.head_object(Bucket=B, Key=key)["ContentLength"]

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else (self.pos + off if whence == 1 else self.size + off)
        return self.pos

    def tell(self):
        return self.pos

    def seekable(self):
        return True

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        if n == 0 or self.pos >= self.size:
            return b""
        end = min(self.size, self.pos + n) - 1
        b = s3.get_object(Bucket=B, Key=self.key, Range=f"bytes={self.pos}-{end}")["Body"].read()
        self.pos += len(b)
        return b


def package_counts(key):
    out = collections.defaultdict(lambda: {"mats": set(), "by_mf": collections.Counter()})
    with zipfile.ZipFile(S3File(key)) as z:
        for name in z.namelist():
            p = name.split("/")
            if len(p) != 4 or not p[0].startswith("nsub"):
                continue
            nsub, mat, mf = int(p[0][4:]), int(p[1][3:]), int(p[2][2:])
            o = out[nsub]
            o["mats"].add(mat)
            o["by_mf"][mf] += 1
    return out


def athena_rows(sql):
    q = athena.start_query_execution(QueryString=sql, QueryExecutionContext={"Database": "nsr"}, WorkGroup="nsrgpt")["QueryExecutionId"]
    while True:
        s = athena.get_query_execution(QueryExecutionId=q)["QueryExecution"]["Status"]["State"]
        if s in ("SUCCEEDED", "FAILED", "CANCELLED"):
            break
        time.sleep(2)
    if s != "SUCCEEDED":
        raise RuntimeError(athena.get_query_execution(QueryExecutionId=q)["QueryExecution"]["Status"])
    rows, cols = [], None
    for page in athena.get_paginator("get_query_results").paginate(QueryExecutionId=q):
        for r in page["ResultSet"]["Rows"]:
            v = [c.get("VarCharValue") for c in r["Data"]]
            if cols is None:
                cols = v
                continue
            rows.append(dict(zip(cols, v)))
    return rows


def main():
    man = json.loads(s3.get_object(Bucket=B, Key=PRE + "manifest.json")["Body"].read())
    jpks = [r for r in man["rows"] if r["file"].endswith(".jpk")]
    lake = collections.defaultdict(lambda: {"mats": 0, "by_mf": {}})
    for r in athena_rows("SELECT release, sublibrary, mf, count(*) AS n, count(DISTINCT concat(file_name, '|', CAST(mat AS varchar))) AS m "
                         "FROM endfb_sections GROUP BY 1, 2, 3"):
        sub = r["sublibrary"]
        sub = "neutrons" if sub.startswith("neutrons") else ("tritons" if sub == "triton" else sub)
        d = lake[(r["release"], sub)]
        d["by_mf"][int(r["mf"])] = d["by_mf"].get(int(r["mf"]), 0) + int(r["n"])
        if int(r["mf"]) == 1:
            d["mats"] += int(r["m"])
    table = []
    for r in jpks:
        rel = release_of(r["package"], r["version"])
        if rel is None and r["package"] == "TSL":
            rel = {"ENDFB-VI.8": "B-VI.8", "ENDFB-VII.0": "B-VII.0", "JEFF-3.0": "JEFF-3.0", "JEFF-3.1": "JEFF-3.1"}.get(r["version"])
        pc = package_counts(r["key"])
        for nsub, o in sorted(pc.items()):
            sub = NSUB.get(nsub, f"nsub{nsub}")
            lk = lake.get((rel, sub))
            pk_non3 = sum(v for mf, v in o["by_mf"].items() if mf != 3)
            row = {"package": f"{r['package']} {r['version']}", "file": r["file"], "release": rel, "sublibrary": sub,
                   "package_materials": len(o["mats"]), "package_sections_non_mf3": pk_non3,
                   "package_by_mf": dict(sorted(o["by_mf"].items()))}
            if lk:
                lk_non3 = sum(v for mf, v in lk["by_mf"].items() if mf != 3)
                diff = {mf: [o["by_mf"].get(mf, 0), lk["by_mf"].get(mf, 0)] for mf in sorted(set(o["by_mf"]) | set(lk["by_mf"]))
                        if mf != 3 and o["by_mf"].get(mf, 0) != lk["by_mf"].get(mf, 0)}
                row.update(lake_materials=lk["mats"], lake_sections_non_mf3=lk_non3, lake_by_mf=dict(sorted(lk["by_mf"].items())),
                           differences=diff, verdict="same" if lk["mats"] == len(o["mats"]) and not diff else "differs")
            else:
                row["verdict"] = "not in the lake"
            table.append(row)
            print(row["package"], r["file"], sub, row["package_materials"], row.get("lake_materials"), pk_non3,
                  row.get("lake_sections_non_mf3"), row["verdict"], json.dumps(row.get("differences", {}))[:200], flush=True)
    # a release split over several package files (TENDL-n in parts, JENDL-5 in parts): sum the parts per release and sublibrary
    agg = collections.defaultdict(lambda: {"package_materials": 0, "package_sections_non_mf3": 0, "files": []})
    for t in table:
        a = agg[(t["release"], t["sublibrary"])]
        a["package_materials"] += t["package_materials"]
        a["package_sections_non_mf3"] += t["package_sections_non_mf3"]
        a["files"].append(t["file"])
        for k in ("lake_materials", "lake_sections_non_mf3"):
            a[k] = t.get(k)
    summary = []
    for (rel, sub), a in sorted(agg.items(), key=lambda x: (str(x[0][0]), x[0][1])):
        same = a.get("lake_materials") == a["package_materials"] and a.get("lake_sections_non_mf3") == a["package_sections_non_mf3"]
        summary.append({"release": rel, "sublibrary": sub, **a,
                        "verdict": "not in the lake" if a.get("lake_materials") is None else ("same" if same else "differs")})
    s3.put_object(Bucket=B, Key=OUT, Body=json.dumps({"built": time.strftime("%FT%TZ", time.gmtime()), "files": table,
                                                      "summary": summary}, indent=1).encode())
    print(json.dumps({"rows": len(summary), "same": sum(s["verdict"] == "same" for s in summary),
                      "differs": [f"{s['release']} {s['sublibrary']}" for s in summary if s["verdict"] == "differs"],
                      "not_in_lake": [f"{s['release']} {s['sublibrary']}" for s in summary if s["verdict"] == "not in the lake"]}))


if __name__ == "__main__":
    main()
