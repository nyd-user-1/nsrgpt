"""Brief 62 Part B.2: RIPL discrete levels and masses, on the ingest box.  /opt/ingest/venv/bin/python -I ripl.py
RIPL-3's site (www-nds.iaea.org/RIPL-3/) answers a Cloudflare challenge to a plain client, so its files are not
fetched. Its successor RIPL-4 (released May 2026, the same seven segments; github.com/IAEA-NDS/RIPL-4) is held since
2026-11-07 at raw/github/IAEA-NDS/RIPL-4/<commit>.tar.gz; this parses that archive, the formats as its readmes give them:
- levels/z001.dat..z118.dat (levels-readme.html): per nucleus an identification record (a5,6i5,2f12.6), then each
  level record (i3,1x,f10.6,1x,f5.1,i3,1x,e10.3,i3,1x,a1,1x,a4,1x,a18,i3, up to ten (1x,a2,1x,e10.4,1x,a7) decay modes,
  f10.6 shift, band) followed by its gamma records (39x,i4,1x,f10.4,3(1x,e10.3)).
- masses/mass-ame20.dat (mass-ame20.readme): AME2020 mass excesses, (2i4,1x,a2,1x,i1,2f10.3).
Tables under lake/ripl/ripl-4-2026-05/: ripl_level_nuclides, ripl_levels, ripl_gammas, ripl_masses_ame2020; manifest
raw/iaea/2026-11-11/ripl/manifest.json."""
import datetime
import glob
import os
import re
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lake  # noqa: E402
import pyarrow as pa  # noqa: E402

COMMIT = "a2172496ae7dcff323584bcc95a32f2e11a2872c"
KEY = f"raw/github/IAEA-NDS/RIPL-4/{COMMIT}.tar.gz"
LOCAL = "/data/ripl"
LAKE = "lake/ripl/ripl-4-2026-05"
S, D, I = pa.string(), pa.float64(), pa.int32()
NUC = pa.schema([("z", I), ("a", I), ("symb", S), ("n_levels", I), ("n_gammas", I), ("n_max", I), ("n_c", I),
                 ("sn_mev", D), ("sp_mev", D)])
LEV = pa.schema([("z", I), ("a", I), ("symb", S), ("level", I), ("e_mev", D), ("spin", D), ("parity", I),
                 ("half_life_s", D), ("n_gammas", I), ("spin_flag", S), ("energy_unc", S), ("spins_ensdf", S),
                 ("n_decay_modes", I), ("decay_modes", S), ("shift_mev", D), ("band", S)])
GAM = pa.schema([("z", I), ("a", I), ("level", I), ("final_level", I), ("e_gamma_mev", D), ("p_gamma", D),
                 ("p_electromagnetic", D), ("icc", D)])
IDENT = re.compile(r"^\s*\d+[A-Za-z]{1,3}\s*$")
MAS = pa.schema([("z", I), ("a", I), ("symbol", S), ("flag", I), ("mass_excess_mev", D), ("err_mev", D)])


def num(s, kind=float):
    s = (s or "").strip()
    if not s:
        return None
    try:
        return kind(float(s)) if kind is int else float(s)
    except ValueError:
        return None


def levels(path, nuc, lev, gam):
    z = a = level = None
    with open(path, encoding="latin-1") as f:
        for ln in f:
            ln = ln.rstrip("\n")
            if not ln.strip() or ln.startswith("#"):
                continue
            if ln[:39].strip() == "" and len(ln) > 43:  # gamma record
                gam.append([z, a, level, num(ln[39:43], int), num(ln[44:54]), num(ln[55:65]), num(ln[66:76]),
                            num(ln[77:87])])
            elif not IDENT.match(ln[0:5]):  # level record (columns 1-5 of an identification record are A and symbol)
                level = num(ln[0:3], int)
                nd = num(ln[63:66], int) or 0
                modes = []
                for k in range(min(nd, 10)):
                    seg = ln[66 + 22 * k: 88 + 22 * k]
                    if seg.strip():
                        modes.append(f"{seg[15:22].strip()} {seg[1:3].strip()} {seg[4:14].strip()}".strip())
                tail = ln[286:]  # shift and band come after all ten decay-mode slots
                lev.append([z, a, symb, level, num(ln[4:14]), num(ln[15:20]), num(ln[20:23], int), num(ln[24:34]),
                            num(ln[34:37], int), ln[38:39].strip() or None, ln[40:44].strip() or None,
                            ln[45:63].strip() or None, nd, "; ".join(modes) or None, num(tail[0:10]),
                            tail[11:].strip() or None])
            else:  # identification record
                symb = ln[0:5].strip()
                z, a = num(ln[10:15], int), num(ln[5:10], int)
                nuc.append([z, a, symb, num(ln[15:20], int), num(ln[20:25], int), num(ln[25:30], int),
                            num(ln[30:35], int), num(ln[35:47]), num(ln[47:59])])


def write(name, schema, rows):
    t = pa.Table.from_arrays([pa.array([r[i] for r in rows], type=f.type) for i, f in enumerate(schema)], schema=schema)
    folder = f"{LOCAL}/out/{name}"
    os.makedirs(folder, exist_ok=True)
    import pyarrow.parquet as pq
    pq.write_table(t, f"{folder}/part-00000.parquet", compression="snappy")
    lake.sync(folder, f"{LAKE}/{name}/")
    count, _ = lake.register(f"ripl_{name}", schema, f"s3://{lake.BUCKET}/{LAKE}/{name}/", "/opt/ingest/ddl")
    return {"rows": t.num_rows, "athena_count": count, "location": f"{LAKE}/{name}/"}


def main():
    t0 = time.time()
    os.makedirs(LOCAL, exist_ok=True)
    root = glob.glob(f"{LOCAL}/RIPL-4-*")
    if not root:
        lake.download(KEY, f"{LOCAL}/r4.tgz")
        subprocess.run(["tar", "xzf", f"{LOCAL}/r4.tgz", "-C", LOCAL], check=True)
        root = glob.glob(f"{LOCAL}/RIPL-4-*")
    root = root[0]
    nuc, lev, gam = [], [], []
    files = sorted(glob.glob(f"{root}/levels/z[0-9][0-9][0-9].dat"))
    for p in files:
        levels(p, nuc, lev, gam)
    mas = []
    with open(f"{root}/masses/mass-ame20.dat", encoding="latin-1") as f:
        for ln in f:
            if ln.startswith("#") or not ln.strip():
                continue
            mas.append([num(ln[0:4], int), num(ln[4:8], int), ln[9:11].strip(), num(ln[12:13], int), num(ln[13:23]),
                        num(ln[23:33])])
    tables = {"nsr.ripl_level_nuclides": write("level_nuclides", NUC, nuc), "nsr.ripl_levels": write("levels", LEV, lev),
              "nsr.ripl_gammas": write("gammas", GAM, gam), "nsr.ripl_masses_ame2020": write("masses_ame2020", MAS, mas)}
    check = sum(r[3] or 0 for r in nuc), sum(r[4] or 0 for r in nuc)
    out = {"source": "RIPL-4, Reference Input Parameter Library (IAEA CRP, released May 2026)",
           "held_key": KEY, "commit": COMMIT, "repo": "https://github.com/IAEA-NDS/RIPL-4",
           "parsed_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "terms": "RIPL-4 LICENSE.md in the archive (IAEA); masses: AME2020, Wang et al., Chinese Physics C 45, 030003",
           "ripl_3": "www-nds.iaea.org/RIPL-3/ answers a Cloudflare challenge to a plain client (2026-11-10); its pages and "
                     "four small files are held in raw/iaea/2026-11-07/RIPL-3/; RIPL-4 supersedes it and is parsed here",
           "level_files": len(files), "tables": tables,
           "identification_counts_vs_rows": {"levels_declared": check[0], "levels_parsed": len(lev),
                                             "gammas_declared": check[1], "gammas_parsed": len(gam)},
           "seconds": round(time.time() - t0, 1)}
    for f in os.listdir("/opt/ingest/ddl"):
        lake.s3.upload_file(f"/opt/ingest/ddl/{f}", lake.BUCKET, f"lake/_work/ingest/ddl/{f}")
    lake.put_json("raw/iaea/2026-11-11/ripl/manifest.json", out)
    print(out)


if __name__ == "__main__":
    main()
