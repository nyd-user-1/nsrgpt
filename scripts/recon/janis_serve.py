"""Brief 74, B2/B3: JANIS's own pointwise cross sections, decoded from its packages and served like the POINT releases.
Runs on a recon box (scripts/recon/userdata.sh), never on the Mac.

  janis_serve.py <release>...        e.g. B-VIII.0 JEFF-3.3 JENDL-4.0u
  janis_serve.py --list              the package each release maps to, and whether its files are in the lake

Per release: its package's .jpk files from lake/_raw/janis-data/<NAME>/<VERSION>/ (NEA GitLab janis/data, copied by
lane A), every MF3 section of every sublibrary decoded (jpk.py), named from lake/serve/endf/<release>/materials/ by
sublibrary and MAT (else from the section's ZA), thinned as serve.py endf_point thins (over 40,000 points: the lowest and
highest in each of 20,000 log-energy steps), written to lake/serve/endf/<release>-janis/xs/, registered as that
partition of nsr.endf_serve_xs, and split into the API's xs_index and xs_series files (serve.py point_files). The counts
go to lake/endfb/<release>/janis/manifest.json, with B2's check: the release's materials with resolved or unresolved
parameters (recon/materials.json) that have MF3 in the package.
"""
import collections
import io
import json
import os
import shutil
import sys
import time
import zipfile

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

sys.path.insert(0, "/opt/recon")
import jpk  # noqa: E402
import recon  # noqa: E402

B, RAW, WORK = recon.B, "lake/_raw/janis-data", "/data/janis"
# package (NAME, VERSION) -> release; anything else is "<NAME>-<VERSION>" (JENDL AD-2017 -> JENDL-AD-2017)
PACKAGE = {("ENDFB", "8.0"): "B-VIII.0", ("ENDFB", "7.1"): "B-VII.1", ("ENDFB", "7.0"): "B-VII.0",
           ("ENDFB", "6.8"): "B-VI.8", ("ENDFB", "6.8-HE"): "B-VI.8-HE", ("JENDL", "5.0"): "JENDL-5",
           ("IRDFF", "2.0"): "IRDFF-II", ("JENDL", "FPDD-2000"): "JENDL-FPD-2000"}
NSUB = {0: "gammas", 3: "photoat", 4: "decay", 5: "sfy", 6: "atomic_relax", 10: "neutrons", 11: "nfy",
        12: "thermal_scatt", 19: "standards", 113: "electrons", 10010: "protons", 10020: "deuterons",
        10030: "tritons", 20030: "helium3s", 20040: "alphas"}  # serve.py SUBLIBRARY
SYM = ("n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr "
       "Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt "
       "Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc "
       "Lv Ts Og").split()


GITLAB = "https://git.oecd-nea.org/api/v4/projects/janis%2Fdata/packages"


def gitlab(url):
    import urllib.request
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "NSRgpt research"}), timeout=60) as r:
        return json.loads(r.read())


def packages():
    """{release: (NAME, VERSION, [jpk keys], complete)}: the lake copy's .jpk files, complete when every .jpk file the
    GitLab package lists is in the lake at its size."""
    sizes = {}
    for page in recon.s3().get_paginator("list_objects_v2").paginate(Bucket=B, Prefix=f"{RAW}/"):
        for o in page.get("Contents", []):
            sizes[o["Key"]] = o["Size"]
    listed = {(p["name"], p["version"]): p["id"] for p in gitlab(f"{GITLAB}?per_page=100")}
    out = {}
    for (name, ver), pid in listed.items():
        want = {f["file_name"]: f["size"] for f in gitlab(f"{GITLAB}/{pid}/package_files?per_page=100")
                if f["file_name"].endswith(".jpk")}
        if not want:
            continue
        keys = [f"{RAW}/{name}/{ver}/{fn}" for fn in want]
        complete = all(sizes.get(k) == want[k.rsplit("/", 1)[-1]] for k in keys)
        out[PACKAGE.get((name, ver), f"{name}-{ver}")] = (name, ver, [k for k in keys if k in sizes], complete)
    return out


def section(ls):
    c = [ls[1][i * 11:(i + 1) * 11] for i in range(6)]
    qm, qi = recon.floats(c[:2])
    lr, nr, np_ = int(c[3] or 0), int(c[4]), int(c[5])
    nl = (2 * nr + 5) // 6
    ints = [int(x) for ln in ls[2:2 + nl] for x in (ln[i * 11:(i + 1) * 11] for i in range(6)) if x.strip()]
    v = recon.floats([ln[i * 11:(i + 1) * 11] for ln in ls[2 + nl:] for i in range(6)][:2 * np_])
    if len(v) != 2 * np_:
        raise ValueError(f"{len(v)} numbers for {np_} points")
    za = float(recon.floats([ls[0][:11]])[0])
    return za, float(qm), float(qi), lr, ints[0:2 * nr:2], ints[1:2 * nr:2], v[0::2], v[1::2]


def serve(rel, pk):
    t0 = time.time()
    name_, ver, jkeys, _ = pk
    sv = recon.serve_module()
    mats = {}
    try:
        for m in recon.dataset(f"lake/serve/endf/{rel}/materials/").to_table(
                columns=["sublibrary", "mat", "name", "z", "a", "liso", "za"]).to_pylist():
            mats.setdefault((m["sublibrary"], m["mat"]), m)
    except Exception as e:  # noqa: BLE001  a release the lake has not parsed: names from ZA
        print(json.dumps({"release": rel, "no_materials": str(e)[:200]}), flush=True)
    d = f"{WORK}/{rel}"
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    name = f"{rel}-janis"
    path = f"{d}/part-00000.parquet"
    w = pq.ParquetWriter(path, recon.SERVE_SCHEMA, compression="snappy")
    st = collections.Counter()
    by_sub, unnamed, errors, have = collections.Counter(), set(), [], set()
    files = []
    for key in sorted(jkeys):
        local = f"{d}/{key.rsplit('/', 1)[-1]}"
        recon.s3().download_file(B, key, local)
        files.append({"key": key, "bytes": os.path.getsize(local)})
        with zipfile.ZipFile(local) as z:
            groups = collections.defaultdict(list)
            for mname in z.namelist():
                if "/mf3/" in mname:
                    nsub, mat, mf, mt = jpk.split(mname)
                    groups[(nsub, mat)].append((mt, mname))
            for (nsub, mat), secs in sorted(groups.items()):
                sub = NSUB.get(nsub, f"nsub{nsub}")
                m = mats.get((sub, mat))
                cols = {k: [] for k in recon.SERVE_SCHEMA.names}
                for mt, mname in sorted(secs):
                    try:
                        za, qm, qi, lr, nbt, law, e, x = section(jpk.member(z, mname))
                    except Exception as ex:  # noqa: BLE001
                        errors.append({"member": mname, "error": str(ex)[:200]})
                        continue
                    if m is None:
                        unnamed.add((sub, mat))
                        zz, aa = int(za) // 1000, int(za) % 1000
                        m = {"name": f"{SYM[zz] if zz < len(SYM) else zz}-{aa if aa else 'nat'}", "z": zz, "a": aa,
                             "liso": 0, "za": za}
                    keep = recon.thin(e, x)
                    n = len(e)
                    if keep is not None:
                        e, x = e[keep], x[keep]
                        nbt, law = ([len(e)], [law[0]]) if len(law) == 1 else (None, None)
                        st["thinned"] += 1
                    vals = {"release": name, "sublibrary": sub, "name": m["name"], "z": m["z"], "a": m["a"],
                            "liso": m["liso"], "za": m["za"], "mat": mat, "mt": mt, "n_points": n,
                            "e_min": float(e[0]), "e_max": float(e[-1]), "interp_nbt": nbt, "interp_law": law,
                            "qm": qm, "qi": qi, "lr": lr, "energy_ev": e.tolist(), "xs_barn": x.tolist(),
                            "n_served": len(e), "thinned": keep is not None}
                    for k, v in vals.items():
                        cols[k].append(v)
                    st["sections"] += 1
                    st["points"] += n
                    st["points_served"] += len(e)
                    by_sub[sub] += 1
                    have.add((sub, mat))
                if cols["mt"]:
                    w.write_table(pa.table(cols, schema=recon.SERVE_SCHEMA), row_group_size=32)
        os.remove(local)
    w.close()
    if not st["sections"]:
        raise RuntimeError(f"{rel}: no MF3 sections in {jkeys}")
    prefix = f"lake/serve/endf/{name}/xs/"
    sv.clear(prefix)
    recon.s3().upload_file(path, B, f"{prefix}part-00000.parquet")
    n_reg, _ = sv.register("endf_serve_xs", pq.read_schema(path), prefix,
                           "ENDF/B MF3 cross sections as point arrays, one row each", partition=name, drop=False)
    sv.manifest = lambda key, base, tables: None  # this script's manifest records it; no shared read-modify-write
    sv.point_files(name)
    # B2: the release's materials with resolved or unresolved parameters, and whether JANIS's package holds their MF3
    b2 = None
    try:
        lst = recon.get_json(f"lake/endfb/{rel}/recon/materials.json")["materials"]
        miss = [{"name": m["name"], "mat": m["mat"], "sublibrary": m["sublibrary"]} for m in lst
                if (m["sublibrary"], m["mat"]) not in have]
        b2 = {"with_parameters": len(lst), "in_package": len(lst) - len(miss), "missing": miss}
    except Exception as e:  # noqa: BLE001
        b2 = {"error": str(e)[:200]}
    man = {"release": rel, "served_as": name, "package": f"{name_} {ver}", "files": files, "built_at": recon.now(),
           "sections": st["sections"], "registered_rows": n_reg, "sections_by_sublibrary": dict(by_sub),
           "materials": len(have), "points": st["points"], "points_served": st["points_served"],
           "thinned_sections": st["thinned"], "named_from_za": sorted(list(x) for x in unnamed), "errors": errors,
           "b2": b2, "seconds": round(time.time() - t0, 1),
           "temperature": "293.6 K (brief 74 B1: JANIS's values agree with broadening to 293.6 K, not 0 K or 300 K)",
           "source": "NEA GitLab janis/data, the package JANIS installs offline; MF3 decoded unchanged (jpk.py)"}
    recon.put_json(f"lake/endfb/{rel}/janis/manifest.json", man)
    shutil.rmtree(d, ignore_errors=True)
    print(json.dumps({k: man[k] for k in ("release", "sections", "registered_rows", "materials", "points",
                                          "thinned_sections", "seconds")} | {"b2": {k: v for k, v in (b2 or {}).items()
                                                                                       if k != "missing"},
                                                                              "errors": len(errors)}), flush=True)


if __name__ == "__main__":
    pks = packages()
    if sys.argv[1:] == ["--list"]:
        for r, (n, v, ks, ok) in sorted(pks.items()):
            print(f"{r}\t{n} {v}\t{len(ks)} jpk in the lake\t{'complete' if ok else 'incomplete'}")
        sys.exit()
    for r in sys.argv[1:]:
        if r not in pks or not pks[r][3]:
            print(json.dumps({"release": r, "error": "package not (fully) in the lake yet"}), flush=True)
            continue
        try:
            serve(r, pks[r])
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"release": r, "error": f"{type(e).__name__}: {e}"[:600]}), flush=True)
