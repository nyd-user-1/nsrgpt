"""Brief 74, B2/B3: JANIS's own pointwise cross sections, decoded from its packages and served like the POINT releases.
Runs on a recon box (scripts/recon/userdata.sh), never on the Mac.

  janis_serve.py <release>...        e.g. B-VIII.0 JEFF-3.3 JENDL-4.0u
  janis_serve.py --list              the package each release maps to, and whether its files are in the lake
  janis_serve.py --loop              serve each release once its package is complete (claims; several boxes at once)
  janis_serve.py --mf10 <release>…   MF10 MT18 as the MT 18 cross section where MF3 has none, as JANIS draws it: <release>-mf10

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
    # GitLab's file list, cached once (lake/_work/parse/endfb/recon/janis/gitlab-files.json): the site refuses
    # connections while lane A's bulk copy runs
    listed = recon.get_json("lake/_work/parse/endfb/recon/janis/gitlab-files.json")
    out = {}
    for p in listed:
        name, ver = p["name"], p["version"]
        want = {f["file_name"]: f["size"] for f in p["files"] if f["file_name"].endswith(".jpk")}
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


SCHEMA = recon.SERVE_SCHEMA.append(pa.field("computed", pa.string()))  # JANIS's computed rows, e.g. Sum(MT50-91)


def sum_levels(secs):
    """JANIS's Sum(MT50-91): MT 4 where the material has none, the sum of its MT 50-91 sections on the union of their
    grids, each lin-lin and zero outside its own range (brief 74, B4)."""
    parts = [(e, x) for mt, (e, x) in secs.items() if 50 <= mt <= 91]
    if not parts or 4 in secs:
        return None
    grid = np.unique(np.concatenate([e for e, _ in parts]))
    tot = np.zeros_like(grid)
    for e, x in parts:
        tot += np.interp(grid, e, x, left=0.0, right=0.0)
    return grid, tot


def point_files_local(name, path):
    """serve.py point_files' two files (xs_index with sid, byte_offset, n_bytes; xs_series/series.bin, energies then cross
    sections as little-endian float64), streamed from the local xs parquet one row group at a time in file order, so a
    release of any size fits (point_files holds every array in DuckDB; TENDL-2012 ran it out of 8 GB). The API looks
    sections up by sublibrary, name and MT, so the sid order does not matter."""
    import array
    pf = pq.ParquetFile(path)
    keep = [n for n in pf.schema_arrow.names if n not in ("energy_ev", "xs_barn")]
    cols = {k: [] for k in ["sid"] + keep + ["byte_offset", "n_bytes"]}
    d = os.path.dirname(path)
    spath, ipath = f"{d}/series.bin", f"{d}/xs_index.parquet"
    pos = sid = 0
    with open(spath, "wb") as fh:
        for g in range(pf.num_row_groups):
            t = pf.read_row_group(g).to_pydict()
            for i in range(len(t["mt"])):
                b = array.array("d", t["energy_ev"][i]).tobytes() + array.array("d", t["xs_barn"][i]).tobytes()
                fh.write(b)
                sid += 1
                cols["sid"].append(sid)
                for k in keep:
                    cols[k].append(t[k][i])
                cols["byte_offset"].append(pos)
                cols["n_bytes"].append(len(b))
                pos += len(b)
    fields = [pa.field("sid", pa.int32())] + [pf.schema_arrow.field(k) for k in keep] + [
        pa.field("byte_offset", pa.int64()), pa.field("n_bytes", pa.int64())]
    pq.write_table(pa.table(cols, schema=pa.schema(fields)), ipath, compression="snappy")
    sv = recon.serve_module()
    for sub, local, fn in (("xs_index", ipath, "part-00000.parquet"), ("xs_series", spath, "series.bin")):
        sv.clear(f"lake/serve/endf/{name}/{sub}/")
        recon.s3().upload_file(local, B, f"lake/serve/endf/{name}/{sub}/{fn}")
    print("point_files_local", name, {"sections": sid, "series_bytes": pos}, flush=True)


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
    w = pq.ParquetWriter(path, SCHEMA, compression="snappy")
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
                cols = {k: [] for k in SCHEMA.names}
                decoded, raw = [], {}
                for mt, mname in sorted(secs):
                    try:
                        decoded.append((mt, *section(jpk.member(z, mname)), None))
                        raw[mt] = (decoded[-1][7], decoded[-1][8])
                    except Exception as ex:  # noqa: BLE001
                        errors.append({"member": mname, "error": str(ex)[:200]})
                s4 = sum_levels(raw)
                if s4 is not None and decoded:
                    d0 = decoded[0]
                    decoded.append((4, d0[1], 0.0, 0.0, 0, [len(s4[0])], [2], s4[0], s4[1], "Sum(MT50-91)"))
                    st["computed_sum_mt50_91"] += 1
                for mt, za, qm, qi, lr, nbt, law, e, x, computed in sorted(decoded, key=lambda t: t[0]):
                    if m is None:  # the lake has not parsed this release: ZA, and LISO from MF1/451 (Am-242m)
                        unnamed.add((sub, mat))
                        zz, aa = int(za) // 1000, int(za) % 1000
                        try:
                            liso = int(jpk.member(z, f"nsub{nsub}/mat{mat}/mf1/mt451")[1][33:44] or 0)
                        except Exception:  # noqa: BLE001
                            liso = 0
                        iso = "" if not liso else "m" if liso == 1 else f"m{liso}"
                        m = {"name": f"{SYM[zz] if zz < len(SYM) else zz}-{aa if aa else 'nat'}{iso}", "z": zz, "a": aa,
                             "liso": liso, "za": za}
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
                            "n_served": len(e), "thinned": keep is not None, "computed": computed}
                    for k, v in vals.items():
                        cols[k].append(v)
                    st["sections"] += 1
                    st["points"] += n
                    st["points_served"] += len(e)
                    by_sub[sub] += 1
                    have.add((sub, mat))
                if cols["mt"]:
                    w.write_table(pa.table(cols, schema=SCHEMA), row_group_size=32)
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
    point_files_local(name, path)
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
           "thinned_sections": st["thinned"], "computed_sum_mt50_91": st["computed_sum_mt50_91"], "named_from_za": sorted(list(x) for x in unnamed), "errors": errors,
           "b2": b2, "seconds": round(time.time() - t0, 1),
           "temperature": "293.6 K (brief 74 B1: JANIS's values agree with broadening to 293.6 K, not 0 K or 300 K)",
           "source": "NEA GitLab janis/data, the package JANIS installs offline; MF3 decoded unchanged (jpk.py)"}
    recon.put_json(f"lake/endfb/{rel}/janis/manifest.json", man)
    shutil.rmtree(d, ignore_errors=True)
    print(json.dumps({k: man[k] for k in ("release", "sections", "registered_rows", "materials", "points",
                                          "thinned_sections", "seconds")} | {"b2": {k: v for k, v in (b2 or {}).items()
                                                                                       if k != "missing"},
                                                                              "errors": len(errors)}), flush=True)


NO_MF3 = ("GEFY-", "TSL-", "EXFOR-")  # fission yields, thermal scattering and EXFOR: no MF3 to serve


def loop():
    """Serve each release as soon as its package is complete in the lake, until every package is served or failed.
    A release is claimed with an S3 conditional write (janis/claim), so several boxes can run this at once."""
    import botocore.exceptions
    while True:
        pks = {r: p for r, p in packages().items() if not r.startswith(NO_MF3)}
        done = {r for r in pks if recon.exists(f"lake/endfb/{r}/janis/manifest.json")
                or recon.exists(f"lake/endfb/{r}/janis/error.json")}
        for r, p in sorted(pks.items(), key=lambda kv: sum(1 for _ in kv[1][2])):
            if r in done or not p[3]:
                continue
            try:
                recon.s3().put_object(Bucket=B, Key=f"lake/endfb/{r}/janis/claim", Body=recon.HOST.encode(),
                                      IfNoneMatch="*")
            except botocore.exceptions.ClientError:
                continue
            try:
                serve(r, p)
            except Exception as e:  # noqa: BLE001
                recon.put_json(f"lake/endfb/{r}/janis/error.json", {"release": r, "error": f"{type(e).__name__}: {e}"[:2000],
                                                                     "at": recon.now(), "host": recon.HOST})
                print(json.dumps({"release": r, "error": str(e)[:400]}), flush=True)
        left = [r for r in pks if r not in done]
        print(json.dumps({"loop": recon.now(), "packages": len(pks), "done": len(done), "left": left}), flush=True)
        if not left:
            return
        time.sleep(300)


def mf10_subsections(ls):
    """MF10 MT18's subsections from its lines (HEAD ZA AWR LIS 0 NS 0; NS TAB1s, QM QI IZAP LFS NR NP):
    [(qm, qi, izap, lfs, nbt, law, energies, values)]."""
    c0 = [ls[0][i * 11:(i + 1) * 11] for i in range(6)]
    out, i = [], 1
    for _ in range(int(c0[4])):
        c = [ls[i][k * 11:(k + 1) * 11] for k in range(6)]
        qm, qi = recon.floats(c[:2])
        izap, lfs, nr, np_ = int(c[2]), int(c[3]), int(c[4]), int(c[5])
        nl, dl = (2 * nr + 5) // 6, (2 * np_ + 5) // 6
        ints = [int(x) for ln in ls[i + 1:i + 1 + nl] for x in (ln[k * 11:(k + 1) * 11] for k in range(6)) if x.strip()]
        v = recon.floats([ln[k * 11:(k + 1) * 11] for ln in ls[i + 1 + nl:i + 1 + nl + dl] for k in range(6)][:2 * np_])
        out.append((float(qm), float(qi), izap, lfs, ints[0:2 * nr:2], ints[1:2 * nr:2], v[0::2], v[1::2]))
        i += 1 + nl + dl
    return out


def mf10(rel, pk):
    """MF10 MT18 (fission production, IZAP -1, one TAB1) served as the MT 18 cross section where the material has no
    MT 18 in its MF3, as JANIS draws it (lane A: TENDL-2019's 87 such rows and JEFF-3.3 Tl-205 equal JANIS's Tabler):
    lake/serve/endf/<rel>-mf10/, tried by /endf/xs janis=1 after <rel>-janis. Only the zip directories and the needed
    sections are read, straight from S3."""
    import pyarrow.fs as pafs
    t0 = time.time()
    name_, ver, jkeys, _ = pk
    fs = pafs.S3FileSystem(region=recon.REGION)
    idx = pq.read_table(io.BytesIO(recon.s3().get_object(
        Bucket=B, Key=f"lake/serve/endf/{rel}-janis/xs_index/part-00000.parquet")["Body"].read()),
        columns=["sublibrary", "mat", "mt", "name", "z", "a", "liso", "za"]).to_pylist()
    have18 = {(r["sublibrary"], r["mat"]) for r in idx if r["mt"] == 18}
    names = {(r["sublibrary"], r["mat"]): r for r in idx}
    out = f"{rel}-mf10"
    d = f"{WORK}/{out}"
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    path = f"{d}/part-00000.parquet"
    cols = {k: [] for k in SCHEMA.names}
    skipped = []
    for key in sorted(jkeys):
        with fs.open_input_file(f"{B}/{key}") as fh, zipfile.ZipFile(fh) as z:
            for mname in z.namelist():
                if not mname.endswith("/mf10/mt18"):
                    continue
                nsub, mat, _, _ = jpk.split(mname)
                sub = NSUB.get(nsub, f"nsub{nsub}")
                if (sub, mat) in have18:
                    continue
                subs = [s for s in mf10_subsections(jpk.member(z, mname)) if s[2] == -1]
                m = names.get((sub, mat))
                if len(subs) != 1 or m is None:
                    skipped.append({"member": mname, "izap_minus_1": len(subs), "named": m is not None})
                    continue
                qm, qi, izap, lfs, nbt, law, e, x = subs[0]
                keep = recon.thin(e, x)
                n = len(e)
                if keep is not None:
                    e, x = e[keep], x[keep]
                    nbt, law = ([len(e)], [law[0]]) if len(law) == 1 else (None, None)
                vals = {"release": out, "sublibrary": sub, "name": m["name"], "z": m["z"], "a": m["a"], "liso": m["liso"],
                        "za": m["za"], "mat": mat, "mt": 18, "n_points": n, "e_min": float(e[0]), "e_max": float(e[-1]),
                        "interp_nbt": nbt, "interp_law": law, "qm": qm, "qi": qi, "lr": 0, "energy_ev": e.tolist(),
                        "xs_barn": x.tolist(), "n_served": len(e), "thinned": keep is not None, "computed": "MF10 MT18"}
                for k, v in vals.items():
                    cols[k].append(v)
    rows = len(cols["mt"])
    man = {"release": rel, "served_as": out if rows else None, "rows": rows, "skipped": skipped, "built_at": recon.now(),
           "rule": "MF10 MT18, IZAP -1, where the material has no MF3 MT18 (as JANIS draws it)"}
    if rows:
        pq.write_table(pa.table(cols, schema=SCHEMA), path, compression="snappy", row_group_size=32)
        sv = recon.serve_module()
        prefix = f"lake/serve/endf/{out}/xs/"
        sv.clear(prefix)
        recon.s3().upload_file(path, B, f"{prefix}part-00000.parquet")
        man["registered_rows"], _ = sv.register("endf_serve_xs", pq.read_schema(path), prefix,
                                                "ENDF/B MF3 cross sections as point arrays, one row each", partition=out,
                                                drop=False)
        point_files_local(out, path)
        man["by_sublibrary"] = dict(collections.Counter(cols["sublibrary"]))
    man["seconds"] = round(time.time() - t0, 1)
    recon.put_json(f"lake/endfb/{rel}/janis/mf10.json", man)
    shutil.rmtree(d, ignore_errors=True)
    print(json.dumps({k: v for k, v in man.items() if k != "skipped"} | {"skipped": len(skipped)}), flush=True)


if __name__ == "__main__":
    if sys.argv[1:] == ["--loop"]:
        loop()
        sys.exit()
    pks = packages()
    if sys.argv[1:2] == ["--mf10"]:
        for r in sys.argv[2:]:
            try:
                mf10(r, pks[r])
            except Exception as e:  # noqa: BLE001
                print(json.dumps({"release": r, "error": f"{type(e).__name__}: {e}"[:600]}), flush=True)
        sys.exit()
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
