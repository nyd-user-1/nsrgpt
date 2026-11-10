"""Brief 60: one ENDF-6 -> GNDS 2.0 compile on nsr-jobs-1, run by run.sh as  gnds.py <job id>.

1. Reads the job row from DynamoDB nsrgpt-jobs: params {release, name | mat, sub}, or {file_key, etag, bytes} for an
   uploaded ENDF-6 file (files/pdfs/workspace/<yyyy-mm>/<name>, up to 50 MB), compiled as uploaded.
2. Finds the material in lake/endfb/<release>/materials/ (every release, ENDF/B's folder names read as the word:
   neutrons-version.VIII.1 is neutrons) and writes the whole material, every MF, from lake/endfb/<release>/records/ as a
   tape (broaden.py's tape(), all files kept), cached in /data/tapes.
3. Runs LLNL FUDGE 6.14.0 (/opt/gnds/fudge, built by gnds-install.sh from the lake's copy):
   brownies/bin/endf2gnds.py <tape> <mat>.xml --continuumSpectraFix --formatVersion 2.0 --traceback, as
   scripts/gnds/compile.py does for the precompiled releases.
4. Writes the reactionSuite and, where one comes out, the covarianceSuite gzip-compressed to lake/jobs/<id>/<mat>.xml.gz
   and lake/jobs/<id>/<mat>.cov.xml.gz, and lake/jobs/<id>/result.json (the job, the keys and URLs, sizes, timings).
5. Marks the row done with result_key, summary {name, mat, url, cov_url, ...} and timings, or failed with FUDGE's last
   20 lines.
"""
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
import zlib

import boto3
import pyarrow.dataset as ds
import pyarrow.fs as pafs

BUCKET, REGION, TABLE = "nsr-lake-613473203863", "us-east-2", "nsrgpt-jobs"
CDN = "https://daw1qggkn69lv.cloudfront.net"
FUDGE, PY, FUDGE_VERSION = "/opt/gnds/fudge", "/opt/gnds/venv/bin/python", "6.14.0"
JOB = sys.argv[1]
WD = f"/data/jobs/{JOB}"
db = boto3.client("dynamodb", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
fs = pafs.S3FileSystem(region=REGION)
SYM = ("n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr "
       "Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au "
       "Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts "
       "Og").split()
ZERO = f"{0.0:11.4E}" * 2 + f"{0:11d}" * 4


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def update(**kw):  # copied from broaden.py
    names, vals, sets = {}, {}, []
    for i, (k, v) in enumerate(kw.items()):
        names[f"#k{i}"] = k
        vals[f":v{i}"] = {"S": v if isinstance(v, str) else json.dumps(v)}
        sets.append(f"#k{i} = :v{i}")
    db.update_item(TableName=TABLE, Key={"id": {"S": JOB}}, UpdateExpression="SET " + ", ".join(sets),
                   ExpressionAttributeNames=names, ExpressionAttributeValues=vals)


class Failed(Exception):
    pass


def material_name(s):  # copied from services/nsr-api/structure.py
    t = re.sub(r"[\s_]", "", s or "")
    m = re.fullmatch(r"([A-Za-z]{1,2})-?(\d{1,3}|nat)(m\d?)?", t, re.I) or None
    if m:
        sym, a, iso = m.group(1), m.group(2), m.group(3) or ""
    else:
        m = re.fullmatch(r"(\d{1,3})(m\d?)?-?([A-Za-z]{1,2})", t, re.I)
        if not m:
            return s.strip()
        a, iso, sym = m.group(1), m.group(2) or "", m.group(3)
    a = "nat" if a.lower() == "nat" or a == "0" else str(int(a))
    return f"{sym[0].upper()}{sym[1:].lower()}-{a}{iso.lower()}"


def derived_name(za, liso):  # copied from scripts/gnds/compile.py
    z, a = divmod(int(za or 0), 1000)
    sym = SYM[z] if 0 <= z < len(SYM) else f"Z{z}"
    return f"{sym}-{'nat' if a == 0 else a}{'m' + (str(liso) if liso > 1 else '') if liso else ''}"


def material(release, sub, name, mat):
    t = ds.dataset(f"{BUCKET}/lake/endfb/{release}/materials/", filesystem=fs, format="parquet")
    rows = [r for r in t.to_table(columns=["sublibrary", "file_name", "mat", "za", "liso"]).to_pylist()
            if (r["sublibrary"] or "").split("-version")[0] == sub]
    names = {}
    try:
        st = ds.dataset(f"{BUCKET}/lake/serve/endf/{release}/materials/", filesystem=fs, format="parquet")
        names = {(r["file_name"], r["mat"]): r["name"] for r in st.to_table(columns=["file_name", "mat", "name"]).to_pylist()}
    except Exception:  # noqa: BLE001  (older releases have no serving table)
        pass
    for r in rows:
        r["name"] = names.get((r["file_name"], r["mat"])) or derived_name(r["za"], r["liso"] or 0)
    want = material_name(name).upper() if name else None
    rows = [r for r in rows if (mat and r["mat"] == int(mat)) or (want and r["name"].upper() == want)]
    if not rows:
        raise Failed(f"no {name or mat} in {release} {sub}")
    return sorted(rows, key=lambda r: (r["liso"] or 0, r["mat"]))[0]


def tape(release, m):
    """The whole material from endfb_records as a tape: TPID, its lines (leading MF0 lines dropped), MEND, TEND."""
    # FUDGE reads a thermal-scattering target from the file's base name (HinCH2), so the tape keeps it
    path = f"/data/tapes/{release}__{m['mat']}__{zlib.crc32(m['file_name'].encode()):08x}/{os.path.basename(m['file_name'])}"
    if os.path.exists(path):
        return path
    d = ds.dataset(f"{BUCKET}/lake/endfb/{release}/records/", filesystem=fs, format="parquet")
    t = d.to_table(columns=["line_no", "mf", "text"],
                   filter=(ds.field("file_name") == m["file_name"]) & (ds.field("mat") == m["mat"])).sort_by("line_no")
    out, started = [f"{'nsr-jobs ' + release + ' ' + m['name']:66s}{1:4d}{0:2d}{0:3d}{0:5d}"], False
    for mf, text in zip(t.column("mf").to_pylist(), t.column("text").to_pylist()):
        if not started and not mf:
            continue
        started = True
        out.append(text)
    if len(out) < 4:
        raise Failed(f"no lines for {release} MAT {m['mat']} in endfb_records")
    out += [f"{ZERO}{0:4d}{0:2d}{0:3d}{0:5d}", f"{ZERO}{-1:4d}{0:2d}{0:3d}{0:5d}"]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + ".part", "w", encoding="latin-1") as f:
        f.write("\n".join(out) + "\n")
    os.replace(path + ".part", path)
    return path


def efloat(s):  # copied from broaden.py (Fortran 1.234567+5 and plain floats)
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


def uploaded(p):
    """An uploaded ENDF-6 file (params.file_key, files/pdfs/workspace/<yyyy-mm>/<name>, checked by the Lambda) compiled
    as uploaded, under its own name (FUDGE reads a thermal-scattering target from it). MAT, ZA and LISO come from its
    first MF1 MT451 section."""
    key = p["file_key"]
    # the upload route renames a taken name with -2, -3 before the extension; the tape keeps the name as given
    name = re.sub(r"-\d+(\.[A-Za-z0-9]+)$", r"\1", os.path.basename(key))
    path = f"/data/uploads/{JOB}/{name}"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    s3.download_file(BUCKET, key, path)
    if os.path.getsize(path) > 50 * 1024 * 1024:
        raise Failed("an upload compiles up to 50 MB")
    head = []
    with open(path, encoding="latin-1") as f:
        for ln in f:
            if ln[70:75] == " 1451":
                head.append(ln)
                if len(head) == 2:
                    break
    if len(head) < 2:
        raise Failed(f"{os.path.basename(key)} has no MF1 MT451 section: not an ENDF-6 material")
    za, mat = efloat(head[0][0:11]), int(head[0][66:70])
    liso = int(efloat(head[1][33:44]))
    return {"mat": mat, "za": za, "liso": liso, "name": derived_name(za, liso), "file_name": key}, path

def gz_put(src, key, filename):
    dst = src + ".gz"
    with open(src, "rb") as fi, gzip.open(dst, "wb", compresslevel=6) as fo:
        shutil.copyfileobj(fi, fo, 1 << 20)
    s3.upload_file(dst, BUCKET, key, ExtraArgs={"ContentType": "application/gzip",
                                                "ContentDisposition": f'attachment; filename="{filename}"'})
    return os.path.getsize(dst)


def main():
    t0 = time.time()
    item = db.get_item(TableName=TABLE, Key={"id": {"S": JOB}})["Item"]
    p = json.loads(item["params"]["S"])
    update(status="running", started_at=now())
    upload = bool(p.get("file_key"))
    release, sub = ("upload", "upload") if upload else (p["release"], p.get("sub") or "neutrons")
    shutil.rmtree(WD, ignore_errors=True)
    os.makedirs(WD)
    timings = {}
    try:
        t = time.time()
        if upload:
            m, src = uploaded(p)
        else:
            m = material(release, sub, p.get("name"), p.get("mat"))
            src = tape(release, m)
        timings["tape_s"] = round(time.time() - t, 2)
        t = time.time()
        stem = str(m["mat"])
        try:
            r = subprocess.run([PY, f"{FUDGE}/brownies/bin/endf2gnds.py", src, f"{WD}/{stem}.xml", "--continuumSpectraFix",
                                "--formatVersion", "2.0", "--traceback"], cwd=WD, capture_output=True, text=True,
                               timeout=2400, env={**os.environ, "PYTHONPATH": FUDGE, "HOME": "/root"})
            log, rc = (r.stdout or "") + (r.stderr or ""), r.returncode
        except subprocess.TimeoutExpired:
            log, rc = "Timeout: endf2gnds ran 2400 s", -9
        timings["endf2gnds_s"] = round(time.time() - t, 2)
        xml = f"{WD}/{stem}.xml"
        if rc != 0 or not os.path.exists(xml) or os.path.getsize(xml) < 200:
            tail = "\n".join([ln for ln in log.splitlines() if ln.strip()][-20:])
            raise Failed(f"endf2gnds exit {rc}\n{tail}")
        with open(xml, "rb") as f:
            head = f.read(4096).decode("utf-8", "replace")
        fm = re.search(r'<reactionSuite[^>]*\sformat="([^"]+)"', head) or re.search(r'\sformat="([^"]+)"', head)
        base = (os.path.splitext(os.path.basename(p["file_key"]))[0] if upload else f"{release}_{sub}_{m['name']}").replace("/", "-")
        key = f"lake/jobs/{JOB}/{stem}.xml.gz"
        out = {"name": m["name"], "mat": m["mat"], "za": int(m["za"] or 0), "release": release, "sublibrary": sub,
               "key": key, "url": f"{CDN}/{key}", "bytes": gz_put(xml, key, f"{base}.gnds.xml.gz"),
               "xml_bytes": os.path.getsize(xml), "cov_key": None, "cov_url": None, "cov_bytes": None,
               "gnds_version": fm.group(1) if fm else None, "fudge_version": FUDGE_VERSION,
               **({"file_key": p["file_key"]} if upload else {})}
        covs = [c for c in glob.glob(f"{WD}/**/*.xml", recursive=True) if c != xml]  # Covariances/<stem>-covar.xml
        if covs:
            out["cov_key"] = f"lake/jobs/{JOB}/{stem}.cov.xml.gz"
            out["cov_url"] = f"{CDN}/{out['cov_key']}"
            out["cov_bytes"] = gz_put(covs[0], out["cov_key"], f"{base}.gnds-covar.xml.gz")
        timings["total_s"] = round(time.time() - t0, 2)
        result = {"job": JOB, "kind": "gnds", "params": p, **out, "timings": timings, "finished_at": now(),
                  "method": "LLNL FUDGE 6.14.0 brownies/bin/endf2gnds.py --continuumSpectraFix --formatVersion 2.0"}
        rkey = f"lake/jobs/{JOB}/result.json"
        s3.put_object(Bucket=BUCKET, Key=rkey, Body=json.dumps(result, indent=1).encode(), ContentType="application/json")
        update(status="done", finished_at=now(), result_key=rkey, timings=timings, summary=out)
        print(json.dumps({"done": JOB, "timings": timings}))
    except Exception as e:  # noqa: BLE001
        msg = str(e) if isinstance(e, Failed) else f"{type(e).__name__}: {e}"
        timings["total_s"] = round(time.time() - t0, 2)
        update(status="failed", finished_at=now(), error=msg[-4000:], timings=timings)
        print("failed:", msg)
        sys.exit(1)
    finally:
        shutil.rmtree(WD, ignore_errors=True)
        shutil.rmtree(f"/data/uploads/{JOB}", ignore_errors=True)


if __name__ == "__main__":
    main()
