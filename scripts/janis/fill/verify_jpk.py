"""Brief 73: every JANIS package (lake/_raw/janis-data/, NEA GitLab janis/data) against the lake's own parse of the same
library, by materials per sublibrary and by sections outside MF3 and the covariance Files 30-40 (JANIS keeps covariances in
its BOXER files; neutron MF3 in a package is JANIS's processed data, so
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


COV = set(range(30, 41))  # covariances: JANIS keeps them in its BOXER files, not in the .jpk


def package_sections(key):
    """nsub -> the set of (mat, mf, mt) sections in one package file."""
    out = collections.defaultdict(set)
    with zipfile.ZipFile(S3File(key)) as z:
        for name in z.namelist():
            p = name.split("/")
            if len(p) != 4 or not p[0].startswith("nsub"):
                continue
            out[int(p[0][4:])].add((int(p[1][3:]), int(p[2][2:]), int(p[3][2:])))
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
    for r in athena_rows("SELECT s.release, CASE WHEN s.sublibrary = '(root)' THEN CAST(m.nsub AS varchar) ELSE s.sublibrary END AS sublibrary, "
                         "s.mf, count(*) AS n, count(DISTINCT concat(s.file_name, '|', CAST(s.mat AS varchar))) AS m FROM endfb_sections s "
                         "LEFT JOIN endfb_materials m ON m.release = s.release AND m.sublibrary = s.sublibrary AND m.file_name = s.file_name "
                         "AND m.mat = s.mat GROUP BY 1, 2, 3"):
        sub = r["sublibrary"] or ""
        sub = NSUB.get(int(sub), sub) if sub.isdigit() else sub  # B-VI.8's (root): the material's NSUB
        sub = "neutrons" if sub.startswith("neutrons") else ("tritons" if sub == "triton" else sub)
        d = lake[(r["release"], sub)]
        d["by_mf"][int(r["mf"])] = d["by_mf"].get(int(r["mf"]), 0) + int(r["n"])
        if int(r["mf"]) == 1:
            d["mats"] += int(r["m"])
    # a release's package files (parts of one tape, or whole files beside their parts, as EAF ships): the union of their
    # sections, so nothing is counted twice
    def rel_of(r):
        rel = release_of(r["package"], r["version"])
        if rel is None and r["package"] == "TSL":
            rel = {"ENDFB-VI.8": "B-VI.8", "ENDFB-VII.0": "B-VII.0", "JEFF-3.0": "JEFF-3.0", "JEFF-3.1": "JEFF-3.1"}.get(r["version"])
        return rel
    groups = collections.defaultdict(list)
    for r in jpks:
        groups[(r["package"], r["version"])].append(r)
    summary = []
    for gkey in sorted(groups):  # one package at a time, so only one release's sections are held
        union, files = collections.defaultdict(set), collections.defaultdict(list)
        for r in groups[gkey]:
            for nsub, secs in package_sections(r["key"]).items():
                sub = NSUB.get(nsub, f"nsub{nsub}")
                union[(rel_of(r), sub)] |= secs
                files[(rel_of(r), sub)].append(r["file"])
        for (rel, sub), secs in sorted(union.items(), key=lambda x: (str(x[0][0]), x[0][1])):
            by_mf = collections.Counter(mf for _, mf, _ in secs)
            mats = len({m for m, mf, mt in secs if (mf, mt) == (1, 451)}) or len({m for m, _, _ in secs})
            pk_non3 = sum(v for mf, v in by_mf.items() if mf != 3 and mf not in COV)
            row = {"release": rel, "sublibrary": sub, "files": files[(rel, sub)], "package_materials": mats,
                   "package_sections_non_mf3": pk_non3, "package_by_mf": dict(sorted(by_mf.items()))}
            lk = lake.get((rel, sub))
            if lk:
                lk_non3 = sum(v for mf, v in lk["by_mf"].items() if mf != 3 and mf not in COV)
                diff = {mf: [by_mf.get(mf, 0), lk["by_mf"].get(mf, 0)] for mf in sorted(set(by_mf) | set(lk["by_mf"]))
                        if mf != 3 and mf not in COV and by_mf.get(mf, 0) != lk["by_mf"].get(mf, 0)}
                row.update(lake_materials=lk["mats"], lake_sections_non_mf3=lk_non3, lake_by_mf=dict(sorted(lk["by_mf"].items())),
                           differences=diff, verdict="same" if lk["mats"] == mats and not diff else "differs")
            else:
                row["verdict"] = "not in the lake"
            summary.append(row)
            print(rel, sub, mats, row.get("lake_materials"), pk_non3, row.get("lake_sections_non_mf3"), row["verdict"],
                  json.dumps(row.get("differences", {}))[:300], flush=True)
    s3.put_object(Bucket=B, Key=OUT, Body=json.dumps({"built": time.strftime("%FT%TZ", time.gmtime()), "summary": summary},
                                                     indent=1).encode())
    print(json.dumps({"rows": len(summary), "same": sum(s["verdict"] == "same" for s in summary),
                      "differs": [f"{s['release']} {s['sublibrary']}" for s in summary if s["verdict"] == "differs"],
                      "not_in_lake": [f"{s['release']} {s['sublibrary']}" for s in summary if s["verdict"] == "not in the lake"]}))


if __name__ == "__main__":
    main()
