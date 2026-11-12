"""Brief 74, B1: my reconstructed curves against JANIS Web's Tabler values (janis_tabler.py), per page.
Runs on a recon box (/opt/parse/bin/python), never on the Mac.

  b1.py "ENDF/B-VIII.0|U235|18" ...      -> lake/_work/parse/endfb/recon/b1.json, and a table printed

For each page and each of my temperatures (0K, 293.6K from recon/out/<id>.parquet, plus NNDC POINT where held), my curve
is interpolated lin-lin (PREPRO's output law) at JANIS's own energies inside my energy range, and the relative difference
(mine - JANIS) / JANIS is summarised over JANIS's points with a cross section above 0: median and largest absolute, the
share within JANIS's print precision (half a unit in its 7th significant digit), within 0.1% and within 1%. Also the
share of JANIS's energies that are nodes of my grid (to 7 significant digits).
"""
import io
import json
import re
import sys

import boto3
import numpy as np
import pyarrow.dataset as ds
import pyarrow.fs as pafs
import pyarrow.parquet as pq

B, REGION = "nsr-lake-613473203863", "us-east-2"
OUT = "lake/_work/parse/endfb/recon"
s3 = boto3.client("s3", region_name=REGION)
REL = {"ENDF/B-VIII.0": "B-VIII.0", "ENDF/B-VIII.1": "B-VIII.1"}


def ours_name(nuc):
    m = re.fullmatch(r"([A-Z][a-z]?)(\d+)(m?\d?)", nuc)
    return f"{m.group(1)}-{int(m.group(2))}{m.group(3)}"


def stats(e_j, x_j, e, x):
    lo, hi = e[0], e[-1]
    sel = (e_j >= lo) & (e_j <= hi) & (x_j > 0)
    ej, xj = e_j[sel], x_j[sel]
    mine = np.interp(ej, e, x)
    d = (mine - xj) / xj
    a = np.abs(d)
    prec = 0.5 * 10.0 ** (np.floor(np.log10(np.abs(xj))) - 6) / np.abs(xj)  # half a unit in the 7th digit
    nodes = np.isin(np.round(ej, 12), np.round(e, 12)) | (np.abs(np.interp(ej, e, e) - ej) == 0)
    rounded = np.array([float(f"{v:.7g}") for v in e])
    node7 = np.isin(np.array([float(f"{v:.7g}") for v in ej]), rounded)
    worst = int(np.argmax(a)) if len(a) else None
    # where JANIS's energy is one of my nodes (7 significant digits): the values themselves, no interpolation
    mykey = {float(f"{v:.7g}"): xv for v, xv in zip(e, x)}
    on = [(xj[i], mykey[k]) for i, k in enumerate(float(f"{v:.7g}") for v in ej) if k in mykey]
    don = np.array([abs(m_ - j_) / j_ for j_, m_ in on]) if on else np.array([])
    pon = np.array([0.5 * 10.0 ** (np.floor(np.log10(j_)) - 6) / j_ for j_, _ in on]) if on else np.array([])
    return {"janis_points": int(len(e_j)), "compared": int(sel.sum()), "my_points": int(len(e)),
            "median_abs": float(np.median(a)) if len(a) else None, "p99_abs": float(np.quantile(a, 0.99)) if len(a) else None,
            "max_abs": float(a.max()) if len(a) else None,
            "worst": {"energy_ev": float(ej[worst]), "janis": float(xj[worst]), "mine": float(mine[worst])} if worst is not None else None,
            "within_print": float(np.mean(a <= prec)) if len(a) else None, "within_0.1pct": float(np.mean(a <= 1e-3)) if len(a) else None,
            "within_1pct": float(np.mean(a <= 1e-2)) if len(a) else None, "janis_nodes_on_my_grid": float(np.mean(node7)),
            "exact_nodes": float(np.mean(nodes)),
            "on_nodes": {"n": len(on), "median_abs": float(np.median(don)) if len(on) else None,
                         "max_abs": float(don.max()) if len(on) else None,
                         "within_print": float(np.mean(don <= pon * 2)) if len(on) else None,
                         "within_1e-4": float(np.mean(don <= 1e-4)) if len(on) else None}}


def mine(rel, nuc, mt):
    doc = json.loads(s3.get_object(Bucket=B, Key=f"lake/endfb/{rel}/recon/materials.json")["Body"].read())
    name = ours_name(nuc)
    ms = [m for m in doc["materials"] if (m["name"] or "").lower() == name.lower() and m["sublibrary"] == "neutrons"]
    if not ms:
        return {}
    m = sorted(ms, key=lambda m: (m["liso"] or 0, m["mat"]))[0]
    out = {}
    for sub in ("out", "out-300K", "out-njoy"):  # recon.py run, and its RECON_T2=300 RECON_SUFFIX=-300K variant
        try:
            body = s3.get_object(Bucket=B, Key=f"lake/endfb/{rel}/recon/{sub}/{m['id']}.parquet")["Body"].read()
        except s3.exceptions.NoSuchKey:
            continue
        for r in pq.read_table(io.BytesIO(body)).to_pylist():
            if r["mt"] == mt:
                out[r["temp"]] = (np.array(r["energy_ev"]), np.array(r["xs_barn"]))
    return out


def nndc(rel, nuc, mt, temp):
    try:
        f = pafs.S3FileSystem(region=REGION)
        t = ds.dataset(f"{B}/lake/serve/endf/{rel}-point-{temp}/xs/", filesystem=f, format="parquet").to_table(
            filter=(ds.field("sublibrary") == "neutrons") & (ds.field("name") == ours_name(nuc)) & (ds.field("mt") == mt))
        r = t.to_pylist()
        return (np.array(r[0]["energy_ev"]), np.array(r[0]["xs_barn"]), r[0]["thinned"]) if r else None
    except Exception:  # noqa: BLE001
        return None


def main(cases):
    res = []
    for c in cases:
        lib, nuc, mt = c.split("|")
        mt = int(mt)
        rel = REL.get(lib, lib)
        slug = f"{lib.replace('/', '_')}__{nuc}__MT{mt}"
        j = json.loads(s3.get_object(Bucket=B, Key=f"{OUT}/janis/{slug}.json")["Body"].read())
        e_j, x_j = np.array(j["energy_ev"]), np.array(j["xs_barn"])
        row = {"library": lib, "release": rel, "nuclide": nuc, "mt": mt, "janis_rows": len(e_j), "mine": {}, "nndc": {}}
        for temp, (e, x) in mine(rel, nuc, mt).items():
            row["mine"][temp] = stats(e_j, x_j, e, x)
        if rel in ("B-VIII.0", "B-VIII.1"):
            for temp in ("0K", "293.6K"):
                p = nndc(rel, nuc, mt, temp)
                if p:
                    row["nndc"][temp] = {**stats(e_j, x_j, p[0], p[1]), "thinned": p[2]}
        res.append(row)
        print(json.dumps({k: row[k] for k in ("library", "nuclide", "mt", "janis_rows")}), flush=True)
        for kind in ("mine", "nndc"):
            for temp, s in row[kind].items():
                print(f"  {kind:5s} {temp:7s} compared {s['compared']:6d} median {s['median_abs']:.2e} p99 {s['p99_abs']:.2e} "
                      f"max {s['max_abs']:.2e} print {s['within_print']:.3f} 0.1% {s['within_0.1pct']:.3f} "
                      f"mine {s['my_points']} nodes {s['janis_nodes_on_my_grid']:.3f} on-node {s['on_nodes']} worst {s['worst']}", flush=True)
    s3.put_object(Bucket=B, Key=f"{OUT}/b1.json", Body=json.dumps(res, indent=1).encode(), ContentType="application/json")


if __name__ == "__main__":
    main(sys.argv[1:])
