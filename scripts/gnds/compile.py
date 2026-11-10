"""Brief 60: an ENDF-6 release in the lake -> GNDS 2.0 with LLNL FUDGE 6.14.0 (brownies/bin/endf2gnds.py), on a box
nsr-gnds-N. Runs on the box only (/opt/gnds/venv/bin/python -I), never on the Mac.

  compile.py <release> [<sublibrary>] [--shard i/n] [--workers 2]   # every material of the release (or sublibrary)
  compile.py --one <release> <sublibrary> <mat>                     # one material by hand (Part A); prints its row
  compile.py --manifest                                             # lake/gnds/manifest.json and each index.json

1. The materials come from lake/endfb/<release>/materials/ (nsr.endfb_materials), names from
   lake/serve/endf/<release>/materials/ when the release has it, else from ZA and LISO. With --shard i/n the box takes
   its share of a longest-first split by line count, so n boxes run one release side by side.
2. Each material is written as a tape from lake/endfb/<release>/records/ (the way scripts/jobs/box/broaden.py's tape()
   does, but the whole material, every MF): a TPID line, the material's lines in order (its own leading TPID-like MF0
   lines dropped), MEND, TEND. The record parts are read once, batch by batch.
3. endf2gnds.py <tape> <mat>.xml --continuumSpectraFix --formatVersion 2.0 --traceback (FUDGE's README: safe for every file; fixes unnormalizeable
   continuum photon spectra), `workers` at a time, longest first, 40 minutes each at most. The reactionSuite and, where
   one comes out, the covarianceSuite go gzip-compressed to lake/gnds/<release>/<sublibrary>/<mat>.xml.gz and
   <mat>.cov.xml.gz.
4. A row per material in lake/gnds/<release>/catalog/<sublibrary>.<shard>.parquet (nsr.gnds_files): release, sublibrary,
   mat, za, name, file_name, key, cov_key, bytes, cov_bytes, xml_bytes, fudge_version, gnds_version, seconds, ok, error.
   A failure keeps FUDGE's last 20 lines; nothing is retried. The run's wall time goes to lake/gnds/<release>/runs/.
"""
import concurrent.futures as cf
import datetime
import glob
import gzip
import json
import os
import re
import shutil
import subprocess
import sys
import time

import boto3
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.fs as pafs
import pyarrow.parquet as pq

BUCKET, REGION, WORKGROUP = "nsr-lake-613473203863", "us-east-2", "nsrgpt"
FUDGE = "/opt/gnds/fudge"
PY = "/opt/gnds/venv/bin/python"
FUDGE_VERSION = "6.14.0"
RATE = 0.09576  # m7i-flex.large on demand, us-east-2, $ an hour
TIMEOUT = 2400
s3 = boto3.client("s3", region_name=REGION)
fs = pafs.S3FileSystem(region=REGION)
SYM = ("n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr "
       "Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au "
       "Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts "
       "Og").split()
SCHEMA = pa.schema([("release", pa.string()), ("sublibrary", pa.string()), ("mat", pa.int32()), ("za", pa.int32()),
                    ("name", pa.string()), ("file_name", pa.string()), ("key", pa.string()), ("cov_key", pa.string()),
                    ("bytes", pa.int64()), ("cov_bytes", pa.int64()), ("xml_bytes", pa.int64()),
                    ("fudge_version", pa.string()), ("gnds_version", pa.string()), ("seconds", pa.float64()),
                    ("ok", pa.bool_()), ("error", pa.string())])
ZERO = f"{0.0:11.4E}" * 2 + f"{0:11d}" * 4


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def derived_name(za, liso):
    z, a = divmod(int(za or 0), 1000)
    sym = SYM[z] if 0 <= z < len(SYM) else f"Z{z}"
    return f"{sym}-{'nat' if a == 0 else a}{'m' + (str(liso) if liso > 1 else '') if liso else ''}"


def word(sublibrary):
    """ENDF/B names a sublibrary by its folder (neutrons-version.VIII.1); the API and the lake paths use the word."""
    return (sublibrary or "").split("-version")[0]


def materials(release, sub=None):
    t = ds.dataset(f"{BUCKET}/lake/endfb/{release}/materials/", filesystem=fs, format="parquet")
    rows = t.to_table(columns=["sublibrary", "file_name", "mat", "za", "liso", "line_count"]).to_pylist()
    for r in rows:
        r["sublibrary"] = word(r["sublibrary"])
    subs = sub.split(",") if sub else None  # a comma list: those sublibraries, converted in that order
    rows = [r for r in rows if not subs or r["sublibrary"] in subs]
    names = {}
    try:
        st = ds.dataset(f"{BUCKET}/lake/serve/endf/{release}/materials/", filesystem=fs, format="parquet")
        for r in st.to_table(columns=["file_name", "mat", "name"]).to_pylist():
            names[(r["file_name"], r["mat"])] = r["name"]
    except Exception:  # noqa: BLE001  (older releases have no serving table)
        pass
    seen = {}
    for r in rows:
        r["za"] = int(r["za"] or 0)
        r["name"] = names.get((r["file_name"], r["mat"])) or derived_name(r["za"], r["liso"] or 0)
        k = (r["sublibrary"], r["mat"])
        seen[k] = seen.get(k, 0) + 1
        r["stem"] = str(r["mat"]) if seen[k] == 1 else f"{r['mat']}-{seen[k]}"  # a MAT twice in one sublibrary
    return rows


def share(rows, shard):
    """This box's share: longest first, each material to the box with the least lines so far (the same on every box)."""
    i, n = shard
    load, out = [0] * n, []
    for r in sorted(rows, key=lambda r: (-(r["line_count"] or 0), r["sublibrary"], r["file_name"], r["mat"])):
        b = load.index(min(load))
        load[b] += r["line_count"] or 0
        if b == i:
            out.append(r)
    return out


def tape_path(release, r):
    """FUDGE reads a thermal-scattering target from the file's base name (HinCH2, tsl-BeinBeO), so the tape keeps it."""
    return f"/data/tapes/{release}/{r['sublibrary']}/{r['stem']}/{os.path.basename(r['file_name'])}"


def records(release):
    """The release's record parts on local disk (synced once; run() deletes them at the end)."""
    rec = f"/data/rec/{release}"
    if not os.path.exists(f"{rec}/.done"):
        subprocess.run(["/snap/bin/aws", "s3", "sync", f"s3://{BUCKET}/lake/endfb/{release}/records/", rec,
                        "--only-show-errors", "--region", REGION], check=True)
        open(f"{rec}/.done", "w").close()
    return rec


def write_tapes(release, rows):
    """Every wanted material's lines from the release's record parts, read once, appended to its tape."""
    want = {(r["file_name"], r["mat"]): tape_path(release, r) for r in rows}
    todo = {k: p for k, p in want.items() if not os.path.exists(p)}
    if not todo:
        return
    for p in todo.values():
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p + ".part", "w", encoding="latin-1") as f:
            f.write(f"{'nsr-gnds ' + release:66s}{1:4d}{0:2d}{0:3d}{0:5d}\n")
    rec = records(release)
    mats = pa.array(sorted({k[1] for k in todo}), pa.int32())
    files = pa.array(sorted({k[0] for k in todo}), pa.string())
    started = set()
    t0 = time.time()
    for part in sorted(glob.glob(f"{rec}/*.parquet")):
        pf = pq.ParquetFile(part)
        for b in pf.iter_batches(batch_size=2_000_000, columns=["file_name", "mat", "mf", "text"]):
            b = b.filter(pc.is_in(b.column("mat"), value_set=mats))
            if b.num_rows:
                b = b.filter(pc.is_in(b.column("file_name"), value_set=files))
            if not b.num_rows:
                continue
            out = {}
            for fn, mat, mf, text in zip(*(b.column(c).to_pylist() for c in ("file_name", "mat", "mf", "text"))):
                k = (fn, mat)
                if k not in todo:
                    continue
                if k not in started:
                    if not mf:  # the file's TPID line can carry the material's MAT; drop MF0 lines before MF1
                        continue
                    started.add(k)
                out.setdefault(k, []).append(text)
            for k, lines in out.items():
                with open(todo[k] + ".part", "a", encoding="latin-1") as f:
                    f.write("\n".join(lines) + "\n")
        print(f"tapes: {os.path.basename(part)} read, {time.time() - t0:.0f}s", flush=True)
    for p in todo.values():
        with open(p + ".part", "a", encoding="latin-1") as f:
            f.write(f"{ZERO}{0:4d}{0:2d}{0:3d}{0:5d}\n{ZERO}{-1:4d}{0:2d}{0:3d}{0:5d}\n")
        os.replace(p + ".part", p)


def gz_put(src, key, filename):
    dst = src + ".gz"
    with open(src, "rb") as fi, gzip.open(dst, "wb", compresslevel=6) as fo:
        shutil.copyfileobj(fi, fo, 1 << 20)
    s3.upload_file(dst, BUCKET, key, ExtraArgs={"ContentType": "application/gzip",
                                                "ContentDisposition": f'attachment; filename="{filename}"'})
    return os.path.getsize(dst)


def convert(release, r, prefix="lake/gnds"):
    """One material: endf2gnds, gzip, upload. Returns its catalog row."""
    sub, stem = r["sublibrary"], r["stem"]
    wd = f"/data/out/{release}/{sub}/{stem}"
    shutil.rmtree(wd, ignore_errors=True)
    os.makedirs(wd)
    row = {"release": release, "sublibrary": sub, "mat": r["mat"], "za": r["za"], "name": r["name"],
           "file_name": r["file_name"], "key": None, "cov_key": None, "bytes": None, "cov_bytes": None,
           "xml_bytes": None, "fudge_version": FUDGE_VERSION, "gnds_version": None, "seconds": None, "ok": False,
           "error": None}
    t = time.time()
    try:
        p = subprocess.run([PY, f"{FUDGE}/brownies/bin/endf2gnds.py", tape_path(release, r), f"{wd}/{stem}.xml",
                            "--continuumSpectraFix", "--formatVersion", "2.0", "--traceback"], cwd=wd, capture_output=True, text=True, timeout=TIMEOUT,
                           env={**os.environ, "PYTHONPATH": FUDGE, "HOME": "/root"})
        log = (p.stdout or "") + (p.stderr or "")
        rc = p.returncode
    except subprocess.TimeoutExpired as e:
        log = ((e.stdout or b"").decode(errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or "")) + \
              ((e.stderr or b"").decode(errors="replace") if isinstance(e.stderr, bytes) else (e.stderr or "")) + \
              f"\nTimeout: endf2gnds ran {TIMEOUT} s"
        rc = -9
    row["seconds"] = round(time.time() - t, 2)
    xml = f"{wd}/{stem}.xml"
    covs = [c for c in glob.glob(f"{wd}/**/*.xml", recursive=True) if c != xml]  # FUDGE writes Covariances/<stem>-covar.xml
    if rc != 0 or not os.path.exists(xml) or os.path.getsize(xml) < 200:
        tail = "\n".join([ln for ln in log.splitlines() if ln.strip()][-20:])
        row["error"] = f"endf2gnds exit {rc}\n{tail}"[-6000:]
        shutil.rmtree(wd, ignore_errors=True)
        return row
    with open(xml, "rb") as f:
        head = f.read(4096).decode("utf-8", "replace")
    m = re.search(r'<reactionSuite[^>]*\sformat="([^"]+)"', head) or re.search(r'\sformat="([^"]+)"', head)
    row["gnds_version"] = m.group(1) if m else None
    base = f"{release}_{sub}_{r['name']}".replace("/", "-")
    row["xml_bytes"] = os.path.getsize(xml)
    row["key"] = f"{prefix}/{release}/{sub}/{stem}.xml.gz"
    row["bytes"] = gz_put(xml, row["key"], f"{base}.gnds.xml.gz")
    if covs:
        row["cov_key"] = f"{prefix}/{release}/{sub}/{stem}.cov.xml.gz"
        row["cov_bytes"] = gz_put(covs[0], row["cov_key"], f"{base}.gnds-covar.xml.gz")
    row["ok"] = True
    shutil.rmtree(wd, ignore_errors=True)
    return row


def save_catalog(release, sub, shard, rows):
    path = f"/data/out/catalog-{release}-{sub}-{shard}.parquet"
    pq.write_table(pa.Table.from_pylist(rows, schema=SCHEMA), path, compression="snappy")
    s3.upload_file(path, BUCKET, f"lake/gnds/{release}/catalog/{sub}.{shard}.parquet")


def athena(sql):
    a = boto3.client("athena", region_name=REGION)
    qid = a.start_query_execution(QueryString=sql, QueryExecutionContext={"Database": "nsr"},
                                  WorkGroup=WORKGROUP)["QueryExecutionId"]
    while True:
        e = a.get_query_execution(QueryExecutionId=qid)["QueryExecution"]
        if e["Status"]["State"] in ("SUCCEEDED", "FAILED", "CANCELLED"):
            return e["Status"]["State"], e["Status"].get("StateChangeReason")
        time.sleep(1)


def register(release):
    cols = ",\n  ".join(f"`{f.name}` {'string' if f.type == pa.string() else 'int' if f.type == pa.int32() else 'bigint' if f.type == pa.int64() else 'double' if f.type == pa.float64() else 'boolean'}"
                        for f in SCHEMA if f.name != "release")
    print(athena(f"CREATE EXTERNAL TABLE IF NOT EXISTS `gnds_files` (\n  {cols}\n)\nPARTITIONED BY (`release` string)\n"
                 f"STORED AS PARQUET\nLOCATION 's3://{BUCKET}/lake/gnds/'\nTBLPROPERTIES ('parquet.compression'='SNAPPY')"))
    print(athena(f"ALTER TABLE `gnds_files` ADD IF NOT EXISTS PARTITION (release='{release}') "
                 f"LOCATION 's3://{BUCKET}/lake/gnds/{release}/catalog/'"))


def run(release, sub, shard, workers):
    t0, started = time.time(), now()
    rows = materials(release, sub)
    mine = share(rows, shard) if shard[1] > 1 else list(rows)
    order = sub.split(",") if sub else []
    mine.sort(key=lambda r: (order.index(r["sublibrary"]) if r["sublibrary"] in order else 0, -(r["line_count"] or 0)))
    tag = f"s{shard[0]}of{shard[1]}"
    print(f"{release} {sub or 'every sublibrary'}: {len(rows)} materials, {len(mine)} on this box ({tag})", flush=True)
    subs = list(dict.fromkeys(r["sublibrary"] for r in mine))
    if not order:
        subs.sort(key=lambda s: (s != "neutrons", s))
    t_tapes, done, i = 0.0, {}, 0
    with cf.ThreadPoolExecutor(workers) as pool:
        for s in subs:  # one sublibrary at a time: its tapes written, converted, deleted (TENDL's would fill the disk)
            part = [r for r in mine if r["sublibrary"] == s]
            t = time.time()
            write_tapes(release, part)
            t_tapes += time.time() - t
            futs = {pool.submit(convert, release, r): r for r in part}
            for f in cf.as_completed(futs):
                i += 1
                r = futs[f]
                try:
                    row = f.result()
                except Exception as e:  # noqa: BLE001
                    row = {"release": release, "sublibrary": r["sublibrary"], "mat": r["mat"], "za": r["za"],
                           "name": r["name"], "file_name": r["file_name"], "fudge_version": FUDGE_VERSION, "ok": False,
                           "error": f"compile.py: {type(e).__name__}: {e}"[-6000:]}
                done.setdefault(row["sublibrary"], []).append(row)
                print(f"{i}/{len(mine)} {row['sublibrary']} {row['mat']} {row['name']} ok={row['ok']} {row.get('seconds')}s",
                      flush=True)
                if os.path.exists(tape_path(release, r)):
                    os.remove(tape_path(release, r))
                if i % 25 == 0:
                    save_catalog(release, s, tag, done[row["sublibrary"]])
            if s in done:
                save_catalog(release, s, tag, done[s])
            shutil.rmtree(f"/data/tapes/{release}/{s}", ignore_errors=True)
    shutil.rmtree(f"/data/rec/{release}", ignore_errors=True)
    allrows = [x for rs in done.values() for x in rs]
    wall = time.time() - t0
    run_doc = {"release": release, "sublibrary": sub, "shard": tag, "started_at": started, "finished_at": now(),
               "wall_s": round(wall, 1), "tapes_s": round(t_tapes, 1), "workers": workers, "box_type": "m7i-flex.large",
               "rate_usd_h": RATE, "spend_usd": round(wall / 3600 * RATE, 4), "materials": len(mine),
               "converted": sum(1 for x in allrows if x["ok"]), "failed": sum(1 for x in allrows if not x["ok"]),
               "fudge_version": FUDGE_VERSION}
    s3.put_object(Bucket=BUCKET, Key=f"lake/gnds/{release}/runs/{(sub or 'all').replace(',', '+')}.{tag}.json",
                  Body=json.dumps(run_doc, indent=1).encode(), ContentType="application/json")
    register(release)
    shutil.rmtree(f"/data/tapes/{release}", ignore_errors=True)
    print(json.dumps(run_doc), flush=True)


def error_class(err):
    """The cause FUDGE gives, its numbers, paths and quoted names stripped, so failures group. FUDGE prints "read ENDF
    error: <msg>"; when <msg> is "len( info.doRaise ) > 0" the problems it collected are the lines above it (the first
    one, warnings left out). Otherwise the last exception or timeout line."""
    lines = [ln.strip() for ln in (err or "").splitlines() if ln.strip()]
    pick = None
    for i, ln in enumerate(lines):
        if "read ENDF error:" in ln:
            pick = ln.split("read ENDF error:", 1)[1].strip()
            if "info.doRaise" in pick:
                causes = [c for c in lines[1:i] if not c.startswith("WARNING")]
                pick = causes[0] if causes else pick
            break
    if pick is None:
        pick = next((ln for ln in reversed(lines) if re.match(r"^[A-Za-z_.]*(Error|Exception|Timeout)\b", ln)),
                    lines[-1] if lines else "unknown")
    pick = re.sub(r"/\S+", "<path>", pick)
    pick = re.sub(r"'[^']*'|\"[^\"]*\"", "<x>", pick)
    return re.sub(r"[-+]?\d[\d.eE+-]*", "#", pick)[:120]


def manifest():
    rels = sorted({p["Prefix"].split("/")[2] for p in s3.list_objects_v2(Bucket=BUCKET, Prefix="lake/gnds/",
                                                                          Delimiter="/").get("CommonPrefixes", [])})
    out = {"generated_at": now(), "fudge": {"version": FUDGE_VERSION, "commit": "41da14cfeaa8d0261451441f5212cd34ccf6b13f",
                                            "lake": "raw/github/2026-11-10/LLNL/fudge/"},
           "gnds_version": "2.0", "converter": "brownies/bin/endf2gnds.py --continuumSpectraFix --formatVersion 2.0 --traceback",
           "rerun": "on a box from scripts/gnds/box/create.sh: /opt/gnds/venv/bin/python -I /opt/gnds/compile.py "
                    "<release> [<sublibrary>] [--shard i/n]; then compile.py --manifest",
           "releases": {}, "totals": {}}
    for rel in rels:
        try:
            rows = ds.dataset(f"{BUCKET}/lake/gnds/{rel}/catalog/", filesystem=fs, format="parquet").to_table().to_pylist()
        except Exception:  # noqa: BLE001
            continue
        mats = {}
        for r in pq.read_table(f"{BUCKET}/lake/endfb/{rel}/materials/", filesystem=fs,
                               columns=["sublibrary"]).column("sublibrary").to_pylist():
            mats[word(r)] = mats.get(word(r), 0) + 1
        runs = []
        for o in s3.list_objects_v2(Bucket=BUCKET, Prefix=f"lake/gnds/{rel}/runs/").get("Contents", []):
            runs.append(json.loads(s3.get_object(Bucket=BUCKET, Key=o["Key"])["Body"].read()))
        best = {}
        for r in rows:  # one row per material: a converted row wins over a failed one
            k = (r["sublibrary"], r["mat"], r["file_name"])
            if k not in best or (r["ok"] and not best[k]["ok"]):
                best[k] = r
        subs = {}
        for r in best.values():
            s = subs.setdefault(r["sublibrary"], {"materials": mats.get(r["sublibrary"], 0), "converted": 0, "failed": 0,
                                                  "errors": {}, "bytes": 0, "cov_files": 0, "cpu_minutes": 0.0})
            s["converted" if r["ok"] else "failed"] += 1
            s["bytes"] += (r["bytes"] or 0) + (r["cov_bytes"] or 0)
            s["cov_files"] += 1 if r["cov_key"] else 0
            s["cpu_minutes"] += (r["seconds"] or 0) / 60
            if not r["ok"]:
                c = error_class(r["error"])
                s["errors"][c] = s["errors"].get(c, 0) + 1
        for s in subs.values():
            s["cpu_minutes"] = round(s["cpu_minutes"], 1)
            s["errors"] = dict(sorted(s["errors"].items(), key=lambda kv: -kv[1]))
            s["not_attempted"] = max(0, s["materials"] - s["converted"] - s["failed"])
        for sub, n in mats.items():
            subs.setdefault(sub, {"materials": n, "converted": 0, "failed": 0, "errors": {}, "bytes": 0, "cov_files": 0,
                                  "cpu_minutes": 0.0, "not_attempted": n})
        out["releases"][rel] = {
            "materials": sum(mats.values()), "converted": sum(s["converted"] for s in subs.values()),
            "failed": sum(s["failed"] for s in subs.values()), "bytes": sum(s["bytes"] for s in subs.values()),
            "wall_minutes": round(sum(r["wall_s"] for r in runs) / 60, 1),
            "spend_usd": round(sum(r["spend_usd"] for r in runs), 2), "runs": len(runs),
            "sublibraries": dict(sorted(subs.items()))}
        index = [{k: r[k] for k in ("sublibrary", "mat", "za", "name", "key", "cov_key", "bytes", "cov_bytes",
                                    "gnds_version")} for r in best.values() if r["ok"]]
        s3.put_object(Bucket=BUCKET, Key=f"lake/gnds/{rel}/index.json", ContentType="application/json", CacheControl="max-age=300",
                      Body=json.dumps({"release": rel, "fudge_version": FUDGE_VERSION, "files": index},
                                      separators=(",", ":")).encode())
    R = out["releases"].values()
    out["totals"] = {k: sum(r[k] for r in R) for k in ("materials", "converted", "failed", "bytes")}
    out["totals"]["spend_usd"] = round(sum(r["spend_usd"] for r in R), 2)
    s3.put_object(Bucket=BUCKET, Key="lake/gnds/manifest.json", Body=json.dumps(out, indent=1).encode(),
                  ContentType="application/json", CacheControl="max-age=300")
    print(json.dumps(out["totals"]), flush=True)


def main():
    a = sys.argv[1:]
    if a and a[0] == "--manifest":
        return manifest()
    if a and a[0] == "--one":
        release, sub, mat = a[1], a[2], int(a[3])
        r = [x for x in materials(release, sub) if x["mat"] == mat][0]
        t = time.time()
        write_tapes(release, [r])
        shutil.rmtree(f"/data/rec/{release}", ignore_errors=True)
        print(f"tape {tape_path(release, r)} written in {time.time() - t:.1f}s", flush=True)
        print(json.dumps(convert(release, r), indent=1))
        return
    shard, workers = (0, 1), 2
    if "--shard" in a:
        i = a.index("--shard")
        x, n = a[i + 1].split("/")
        shard = (int(x), int(n))
        del a[i:i + 2]
    if "--workers" in a:
        i = a.index("--workers")
        workers = int(a[i + 1])
        del a[i:i + 2]
    run(a[0], a[1] if len(a) > 1 else None, shard, workers)


if __name__ == "__main__":
    main()
