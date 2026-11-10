"""Brief 57 follow-up: a reconstructed, Doppler-broadened pointwise release for a library NNDC published no POINT file
for in the lake (ENDF/B-VII.1), by the job box's chain (scripts/jobs/box/broaden.py): each neutron material's MF1, MF2
and MF3 lines from lake/endfb/<release>/records/ written as a one-material tape, then PREPRO 2023 linear (MF3 to
linear-linear within 0.1%), recent (the MF2 resonances added within 0.1%) and sigma1 (broadened to 293.6 K, thinned
within 0.1%; the unresolved range copied, PREPRO's default), and every MF3 section of the result written as rows of
lake/endfb/<release>-point-293.6K/xs_points/ by the POINT releases' convention (sublibrary 293.6K, file_name
293.6K/ZA<zzzaaa>, the same columns). Materials are split over boxes (largest first, dealt round) and run two at a
time on each box's two cores:
  HOME=/root venv/bin/python -I point.py run B-VII.1 <shard> <shards>      # on each box
  HOME=/root venv/bin/python -I point.py manifest B-VII.1 <shards>         # once, after every shard
"""
import json
import os
import shutil
import subprocess
import sys
import time
import zlib
from multiprocessing import Pool

import boto3
import duckdb
import pyarrow as pa
import pyarrow.fs as pafs
import pyarrow.parquet as pq

BUCKET = "nsr-lake-613473203863"
B = f"s3://{BUCKET}"
PREPRO = "/opt/prepro/bin-o2"
WD = "/data/point"
TEMP = 293.6
ERR = 1.0e-3
ZERO = f"{0.0:11.4E}" * 2 + f"{0:11d}" * 4
s3 = boto3.client("s3", region_name="us-east-2")
NS = "regexp_replace(sublibrary, '-version[.].*$', '')"


def con():
    cr = boto3.Session().get_credentials().get_frozen_credentials()
    c = duckdb.connect(config={"memory_limit": "3GB", "threads": 2, "extension_directory": "/opt/duckdb_ext",
                               "temp_directory": "/data/tmp/duckdb"})
    c.execute("LOAD httpfs")
    c.execute(f"CREATE SECRET lake (TYPE s3, KEY_ID '{cr.access_key}', SECRET '{cr.secret_key}', "
              f"SESSION_TOKEN '{cr.token}', REGION 'us-east-2')")
    return c


def card(*fields):
    return "".join(f"{v:11.4E}" if isinstance(v, float) else f"{v:11d}" for v in fields)


def efloat(s):
    s = s.strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        pass
    t = s.replace("D", "E").replace("d", "e").replace(" ", "")
    for i in range(len(t) - 1, 0, -1):
        if t[i] in "+-" and t[i - 1] not in "Ee":
            t = t[:i] + "E" + t[i:]
            break
    return float(t)


def fields6(line):
    line = line.ljust(66)
    return [line[i * 11:(i + 1) * 11] for i in range(6)]


def prog(name, inp, wd, out):
    with open(f"{wd}/{name.upper()}.INP", "w") as f:
        f.write(inp)
    t = time.time()
    p = subprocess.run([f"{PREPRO}/{name}"], cwd=wd, capture_output=True, text=True, timeout=3600)
    ok = os.path.exists(f"{wd}/{out}") and os.path.getsize(f"{wd}/{out}") > 1000
    if p.returncode != 0 or not ok:
        lst = f"{wd}/{name.upper()}.LST"
        text = (open(lst, errors="replace").read() if os.path.exists(lst) else "") + (p.stdout or "")
        raise RuntimeError(f"{name} failed (exit {p.returncode}): " + " | ".join(text.splitlines()[-6:]))
    return round(time.time() - t, 1)


def mf3_sections(path, mat):
    """Every MF3 section of MAT<mat>: {mt: (energies, xs, regions, laws)}."""
    secs = {}
    for ln in open(path, encoding="latin-1"):
        if ln[70:72].strip() == "3" and ln[66:70].strip() == str(mat):
            mt = int(ln[72:75])
            if mt:
                secs.setdefault(mt, []).append(ln)
    out = {}
    for mt, sec in secs.items():
        c = fields6(sec[1])
        nr, np_ = int(c[4]), int(c[5])
        i, ints = 2, []
        while len(ints) < 2 * nr:
            ints += [int(x) if x.strip() else 0 for x in fields6(sec[i])]
            i += 1
        vals = []
        while len(vals) < 2 * np_ and i < len(sec):
            vals += [efloat(x) for x in fields6(sec[i])]
            i += 1
        e, x = vals[0:2 * np_:2], vals[1:2 * np_:2]
        nbt, law = ints[0:2 * nr:2], ints[1:2 * nr:2]
        reg, lw, r = [], [], 0
        for j in range(1, len(e) + 1):
            while r < len(nbt) - 1 and j > nbt[r]:
                r += 1
            reg.append(r + 1)
            lw.append(law[r] if law else 2)
        out[mt] = (e, x, reg, lw)
    return out


def one(m):
    """Reconstruct and broaden one material; (mat, sections or None, timings, error)."""
    mat, tape = m["mat"], m["tape"]
    wd = f"{WD}/m{mat}_{zlib.crc32(m['file_name'].encode()):08x}"
    shutil.rmtree(wd, ignore_errors=True)
    os.makedirs(wd)
    shutil.copy(tape, f"{wd}/ENDFB.IN")
    blank = " " * 11 + "\n"
    tm = {}
    try:
        tm["linear_s"] = prog("linear", card(0, 0, 1.0e-10, 0) + "\nENDFB.IN\nLINEAR.OUT\n" + blank + card(0.0, ERR)
                              + "\n" + blank, wd, "LINEAR.OUT")
        tm["recent_s"] = prog("recent", card(0, 1.0e-10, 0, 0, 1, 0) + "\nLINEAR.OUT\nRECENT.OUT\n" + blank
                              + card(0.0, ERR) + "\n" + blank, wd, "RECENT.OUT")
        tm["sigma1_s"] = prog("sigma1", card(0, 0, TEMP, 1.0e-10, 1, 0) + "\nRECENT.OUT\nSIGMA1.OUT\n" + blank
                              + card(0.0, ERR) + "\n" + blank, wd, "SIGMA1.OUT")
        secs = mf3_sections(f"{wd}/SIGMA1.OUT", mat)
        if not secs:
            raise RuntimeError("no MF3 sections in SIGMA1.OUT")
        shutil.rmtree(wd, ignore_errors=True)
        return mat, m["file_name"], secs, tm, None
    except Exception as e:  # noqa: BLE001
        return mat, m["file_name"], None, tm, str(e)[:600]


def materials(c, src):
    return c.execute(f"""SELECT * FROM read_parquet('{B}/lake/endfb/{src}/materials/*.parquet')
                         WHERE {NS} = 'neutrons' ORDER BY line_count DESC, mat""").fetchall(), \
        [d[0] for d in c.description]


def run(src, shard, shards):
    t0 = time.time()
    rel = f"{src}-point-293.6K"
    os.makedirs(f"{WD}/tapes", exist_ok=True)
    c = con()
    rows, cols = materials(c, src)
    ci = {k: i for i, k in enumerate(cols)}
    mine = [r for i, r in enumerate(rows) if i % shards == shard]
    print(f"{len(rows)} neutron materials in {src}; shard {shard} of {shards}: {len(mine)}", flush=True)
    c.execute("CREATE TABLE want (file_name VARCHAR, mat INTEGER, sub VARCHAR)")
    c.executemany("INSERT INTO want VALUES (?, ?, ?)", [(r[ci["file_name"]], r[ci["mat"]], r[ci["sublibrary"]]) for r in mine])
    lines = c.execute(f"""SELECT r.file_name, r.mat, r.mf, r.text FROM read_parquet('{B}/lake/endfb/{src}/records/*.parquet') r
                          JOIN want w ON w.file_name = r.file_name AND w.mat = r.mat AND w.sub = r.sublibrary
                          WHERE r.mf IN (0, 1, 2, 3) ORDER BY r.file_name, r.mat, r.line_no""").fetchall()
    tapes, cur, buf, prev = {}, None, [], None

    def flush():
        if cur and len(buf) > 3:
            path = f"{WD}/tapes/{cur[1]}_{zlib.crc32(cur[0].encode()):08x}.endf"
            with open(path, "w", encoding="latin-1") as f:
                f.write("\n".join([f"{'nsr-sweep ' + src + ' point':66s}{1:4d}{0:2d}{0:3d}{0:5d}"] + buf
                                  + [f"{ZERO}{0:4d}{0:2d}{0:3d}{0:5d}", f"{ZERO}{-1:4d}{0:2d}{0:3d}{0:5d}"]) + "\n")
            tapes[cur] = path
    for fn, mat, mf, text in lines:
        if (fn, mat) != cur:
            flush()
            cur, buf, prev = (fn, mat), [], None
        if mf in (1, 2, 3):
            buf.append(text)
            prev = mf
        elif mf == 0 and prev in (1, 2, 3):
            buf.append(text)
            prev = 0
    flush()
    jobs = []
    for r in mine:
        k = (r[ci["file_name"]], r[ci["mat"]])
        if k in tapes:
            jobs.append({"mat": k[1], "file_name": k[0], "tape": tapes[k], "za": r[ci["za"]], "liso": r[ci["liso"]] or 0})
    print(f"tapes {len(tapes)} in {time.time() - t0:.0f}s", flush=True)
    meta = {(j["file_name"], j["mat"]): j for j in jobs}
    out = {k: [] for k in ("release", "sublibrary", "file_name", "mat", "mt", "point_seq", "energy_ev", "xs_barn",
                           "interpolation_region", "interpolation")}
    report = {"release": rel, "source": src, "shard": shard, "shards": shards, "materials": len(mine), "done": 0,
              "failed": [], "sections": 0, "points": 0, "timings": {}}
    with Pool(2) as pool:
        for n, (mat, fn, secs, tm, err) in enumerate(pool.imap_unordered(one, jobs), 1):
            j = meta[(fn, mat)]
            if err:
                report["failed"].append({"mat": mat, "file_name": fn, "error": err})
            else:
                name = f"293.6K/ZA{int(round(j['za'])):06d}" + ("M" if j["liso"] else "")
                for mt in sorted(secs):
                    e, x, reg, lw = secs[mt]
                    k = len(e)
                    out["release"] += [rel] * k
                    out["sublibrary"] += ["293.6K"] * k
                    out["file_name"] += [name] * k
                    out["mat"] += [mat] * k
                    out["mt"] += [mt] * k
                    out["point_seq"] += list(range(1, k + 1))
                    out["energy_ev"] += e
                    out["xs_barn"] += x
                    out["interpolation_region"] += reg
                    out["interpolation"] += lw
                    report["sections"] += 1
                    report["points"] += k
                report["done"] += 1
            report["timings"][str(mat)] = tm
            if n % 10 == 0:
                print(f"{n}/{len(jobs)} {time.time() - t0:.0f}s points {report['points']} failed {len(report['failed'])}",
                      flush=True)
    fs = pafs.S3FileSystem(region="us-east-2")
    schema = pq.read_schema(f"{BUCKET}/lake/endfb/B-VIII.1-point-293.6K/xs_points/part-00000.parquet", filesystem=fs)
    tbl = pa.table({f.name: pa.array(out[f.name], type=f.type) for f in schema if f.name in out})
    tbl = tbl.sort_by([("file_name", "ascending"), ("mat", "ascending"), ("mt", "ascending"), ("point_seq", "ascending")])
    path = f"{WD}/part-{shard:05d}.parquet"
    pq.write_table(tbl, path, compression="snappy", row_group_size=100000)
    s3.upload_file(path, BUCKET, f"lake/endfb/{rel}/xs_points/part-{shard:05d}.parquet")
    report["seconds"] = round(time.time() - t0)
    report["bytes"] = os.path.getsize(path)
    s3.put_object(Bucket=BUCKET, Key=f"lake/_work/sweep/point/{rel}-shard-{shard}.json",
                  Body=json.dumps(report, indent=1).encode())
    if shard == 0:  # the materials table, the source's neutron rows renamed by the POINT convention
        sel = ", ".join(
            f"'{rel}' AS release" if k == "release" else "'293.6K' AS sublibrary" if k == "sublibrary" else
            ("'293.6K/ZA' || lpad(CAST(CAST(round(za) AS INTEGER) AS VARCHAR), 6, '0') || "
             "CASE WHEN coalesce(liso, 0) > 0 THEN 'M' ELSE '' END AS file_name") if k == "file_name" else f'"{k}"'
            for k in cols)
        c.execute(f"""COPY (SELECT {sel} FROM read_parquet('{B}/lake/endfb/{src}/materials/*.parquet')
                      WHERE {NS} = 'neutrons' ORDER BY mat) TO '{WD}/materials.parquet' (FORMAT PARQUET, COMPRESSION SNAPPY)""")
        s3.upload_file(f"{WD}/materials.parquet", BUCKET, f"lake/endfb/{rel}/materials/part-00000.parquet")
    print(json.dumps({k: v for k, v in report.items() if k != "timings"}, indent=1), flush=True)


def manifest(src, shards):
    rel = f"{src}-point-293.6K"
    reps = []
    for i in range(shards):
        try:
            reps.append(json.loads(s3.get_object(Bucket=BUCKET, Key=f"lake/_work/sweep/point/{rel}-shard-{i}.json")["Body"].read()))
        except Exception as e:  # noqa: BLE001
            reps.append({"shard": i, "missing": str(e)[:200]})
    m = {"release": rel, "source": src, "written_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
         "method": "PREPRO 2023 (IAEA-NDS/PREPRO cc5fd087, -O2): linear (0.1%), recent (0.1%), sigma1 at 293.6 K (0.1%; "
                   "the unresolved resonance range copied, PREPRO's default), per material from MF1, MF2 and MF3 of "
                   f"lake/endfb/{src}/records/; the POINT releases' convention (sublibrary 293.6K, file_name "
                   "293.6K/ZA<zzzaaa>[M]); scripts/sweep/point.py, brief 57 follow-up",
         "materials": sum(r.get("materials", 0) for r in reps), "done": sum(r.get("done", 0) for r in reps),
         "sections": sum(r.get("sections", 0) for r in reps), "points": sum(r.get("points", 0) for r in reps),
         "failed": [f for r in reps for f in r.get("failed", [])],
         "shards": [{k: r.get(k) for k in ("shard", "materials", "done", "sections", "points", "seconds", "bytes", "missing")}
                    for r in reps]}
    s3.put_object(Bucket=BUCKET, Key=f"lake/endfb/{rel}/manifest.json", Body=json.dumps(m, indent=1).encode(),
                  ContentType="application/json")
    print(json.dumps({k: v for k, v in m.items() if k != "failed"} | {"failed": len(m["failed"])}, indent=1))


if __name__ == "__main__":
    if sys.argv[1] == "run":
        run(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
    else:
        manifest(sys.argv[2], int(sys.argv[3]))
