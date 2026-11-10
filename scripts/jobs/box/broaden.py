"""Brief 51: one Doppler-broadening job on nsr-jobs-1, run by run.sh as  broaden.py <job id>.

1. Reads the job row from DynamoDB nsrgpt-jobs: params {release, name | mat, sub, mt, temps_k}.
2. Finds the material in lake/serve/endf/<release>/materials/ and its lines in lake/endfb/<release>/records/ (the
   row groups for its file and MAT), and writes them as a one-material tape with MF1, MF2 and MF3 only (cached in
   /data/tapes); the job's tape keeps MF3 MT<mt> alone, since broadening treats each reaction on its own.
3. Runs PREPRO 2023 (/opt/prepro/bin-o2, built with -O2; its output is byte for byte that of the repository's -O0
   build, checked on U-235): linear (MF3 to linear-linear within 0.1%), recent (resonances from MF2 added to MF3 within
   0.1%; cached per release, MAT and MT, as it does not depend on temperature), then sigma1 for every temperature at
   once, each in its own folder (Doppler broadening, thinned within 0.1%; the unresolved range copied, PREPRO's default).
4. Reads MF3 MT<mt> from each broadened tape and writes lake/jobs/<id>/<T>K.json ({release, name, mat, mt, temp_k,
   energy_ev, xs_barn}) and lake/jobs/<id>/result.json (the job, each temperature's key and point count, the timings).
5. Marks the row done with result_key and timings, or failed with the error and the failing program's last 40 lines.
"""
import datetime
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
PREPRO = "/opt/prepro/bin-o2" if os.path.isdir("/opt/prepro/bin-o2") else "/opt/prepro/bin"
JOB = sys.argv[1]
WD = f"/data/jobs/{JOB}"
db = boto3.client("dynamodb", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
fs = pafs.S3FileSystem(region=REGION)
ERR = 1.0e-3  # 0.1 per cent: linearizing, reconstruction and thinning tolerance


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def update(**kw):
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


def material(release, sub, name, mat):
    t = ds.dataset(f"{BUCKET}/lake/serve/endf/{release}/materials/", filesystem=fs, format="parquet")
    rows = t.to_table(columns=["sublibrary", "name", "mat", "file_name", "liso", "za", "awr"],
                      filter=ds.field("sublibrary") == sub).to_pylist()
    want = material_name(name).upper() if name else None
    rows = [r for r in rows if (mat and r["mat"] == int(mat)) or (want and (r["name"] or "").upper() == want)]
    if not rows:
        raise Failed(f"no {name or mat} in {release} {sub}")
    return sorted(rows, key=lambda r: (r["liso"] or 0, r["mat"]))[0]


ZERO = f"{0.0:11.4E}" * 2 + f"{0:11d}" * 4


def tape(release, m):
    """The material's MF1, MF2 and MF3 lines from endfb_records, as a tape (TPID, the lines, one FEND after each kept
    file, MEND, TEND). Cached in /data/tapes."""
    path = f"/data/tapes/{release}__{m['mat']}__{zlib.crc32(m['file_name'].encode()):08x}.endf"  # stable across runs
    if os.path.exists(path):
        return path
    d = ds.dataset(f"{BUCKET}/lake/endfb/{release}/records/", filesystem=fs, format="parquet")
    t = d.to_table(columns=["line_no", "mf", "text"],
                   filter=(ds.field("file_name") == m["file_name"]) & (ds.field("mat") == m["mat"])).sort_by("line_no")
    out, prev = [f"{'nsr-jobs ' + release + ' ' + m['name']:66s}{1:4d}{0:2d}{0:3d}{0:5d}"], None
    for mf, text in zip(t.column("mf").to_pylist(), t.column("text").to_pylist()):
        if mf in (1, 2, 3):
            out.append(text)
            prev = mf
        elif mf == 0 and prev in (1, 2, 3):  # the FEND closing a kept file
            out.append(text)
            prev = 0
    if len(out) < 4:
        raise Failed(f"no MF1-MF3 lines for {release} MAT {m['mat']} in endfb_records")
    out += [f"{ZERO}{0:4d}{0:2d}{0:3d}{0:5d}", f"{ZERO}{-1:4d}{0:2d}{0:3d}{0:5d}"]
    os.makedirs("/data/tapes", exist_ok=True)
    with open(path, "w", encoding="latin-1") as f:
        f.write("\n".join(out) + "\n")
    return path


def card(*fields):
    return "".join(f"{v:11.4E}" if isinstance(v, float) else f"{v:11d}" for v in fields)


def launch(prog, inp, wd):
    """Write <PROG>.INP in the folder and start the program there."""
    with open(f"{wd}/{prog.upper()}.INP", "w") as f:
        f.write(inp)
    return time.time(), subprocess.Popen([f"{PREPRO}/{prog}"], cwd=wd, stdout=subprocess.PIPE,
                                         stderr=subprocess.STDOUT, text=True)


def finish(prog, started, wd, out):
    """Wait for the program, check its output tape exists and holds data; on failure, its last 40 lines."""
    t, proc = started
    text, _ = proc.communicate(timeout=1800)
    secs = round(time.time() - t, 2)
    ok = os.path.exists(f"{wd}/{out}") and os.path.getsize(f"{wd}/{out}") > 1000
    if proc.returncode != 0 or not ok:
        lst = f"{wd}/{prog.upper()}.LST"
        text = (open(lst, errors="replace").read() if os.path.exists(lst) else "") + (text or "")
        raise Failed(f"{prog} failed (exit {proc.returncode})\n" + "\n".join(text.splitlines()[-40:]))
    return secs


def run(prog, inp, out, wd=WD):
    return finish(prog, launch(prog, inp, wd), wd, out)


def only_mt(src, dst, mt):
    """The tape with MF3 cut to MT<mt> (and its SEND); MF1, MF2 and every FEND, MEND and TEND line stay."""
    keep, on = [], True
    with open(src, encoding="latin-1") as f:
        for ln in f:
            if ln[70:72].strip() == "3":
                m = ln[72:75].strip()
                if m not in ("", "0"):
                    on = int(m) == mt
                if on:
                    keep.append(ln)
            else:
                keep.append(ln)
    with open(dst, "w", encoding="latin-1") as f:
        f.write("".join(keep))


def fields6(line):
    line = line.ljust(66)
    return [line[i * 11:(i + 1) * 11] for i in range(6)]


def efloat(s):  # copied from scripts/parse/endfb/parse.py (Fortran 1.234567+5 and plain floats)
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


def read_mt(path, mat, mt):
    """MF3 MT<mt> of MAT<mat> from an ENDF tape: (energies, cross sections, interpolation laws)."""
    tag = f"{mat:4d}{3:2d}{mt:3d}"
    sec = [ln for ln in open(path, encoding="latin-1") if ln[66:75] == tag]
    if len(sec) < 3:
        raise Failed(f"no MF3 MT {mt} for MAT {mat} in {os.path.basename(path)}")
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
    vals = vals[:2 * np_]
    return vals[0::2], vals[1::2], ints[1:2 * nr:2]


def main():
    t0 = time.time()
    item = db.get_item(TableName=TABLE, Key={"id": {"S": JOB}})["Item"]
    p = json.loads(item["params"]["S"])
    update(status="running", started_at=now())
    release, sub, mt = p["release"], p.get("sub") or "neutrons", int(p["mt"])
    temps = [float(x) for x in (p.get("temps_k") or [300])]
    os.makedirs(WD, exist_ok=True)
    timings = {}
    try:
        m = material(release, sub, p.get("name"), p.get("mat"))
        t = time.time()
        src = tape(release, m)
        timings["fetch_s"] = round(time.time() - t, 2)
        blank = " " * 11 + "\n"
        cache = f"{src[:-5]}__mt{mt}.recent"
        if os.path.exists(cache):
            shutil.copy(cache, f"{WD}/RECENT.OUT")
            timings["recent_cached"] = True
        else:
            only_mt(src, f"{WD}/ENDFB.IN", mt)
            timings["linear_s"] = run("linear", card(0, 0, 1.0e-10, 0) + "\nENDFB.IN\nLINEAR.OUT\n" + blank
                                      + card(0.0, ERR) + "\n" + blank, "LINEAR.OUT")
            timings["recent_s"] = run("recent", card(0, 1.0e-10, 0, 0, 1, 0) + "\nLINEAR.OUT\nRECENT.OUT\n" + blank
                                      + card(0.0, ERR) + "\n" + blank, "RECENT.OUT")
            shutil.copy(f"{WD}/RECENT.OUT", cache)
        runs = []
        for temp in temps:  # every temperature at once, each in its own folder
            d = f"{WD}/T{temp:g}K"
            os.makedirs(d, exist_ok=True)
            shutil.copy(f"{WD}/RECENT.OUT", f"{d}/RECENT.OUT")
            runs.append((temp, d, launch("sigma1", card(0, 0, temp, 1.0e-10, 1, 0) + "\nRECENT.OUT\nSIGMA1.OUT\n"
                                         + blank + card(0.0, ERR) + "\n" + blank, d)))
        series = []
        for temp, d, started in runs:
            timings[f"sigma1_{temp:g}K_s"] = finish("sigma1", started, d, "SIGMA1.OUT")
            e, x, law = read_mt(f"{d}/SIGMA1.OUT", m["mat"], mt)
            key = f"lake/jobs/{JOB}/{temp:g}K.json"
            doc = {"job": JOB, "release": release, "name": m["name"], "sublibrary": sub, "mat": m["mat"], "mt": mt,
                   "temp_k": temp, "n_points": len(e), "interp_law": sorted(set(law)), "energy_ev": e, "xs_barn": x,
                   "units": {"energy": "eV", "xs": "barn"},
                   "method": "PREPRO 2023 linear, recent, sigma1 (0.1% tolerances; unresolved resonance range "
                             "copied, not broadened)"}
            s3.put_object(Bucket=BUCKET, Key=key, Body=json.dumps(doc, separators=(",", ":")).encode(),
                          ContentType="application/json")
            series.append({"temp_k": temp, "key": key, "n_points": len(e), "e_min_ev": e[0], "e_max_ev": e[-1]})
        timings["total_s"] = round(time.time() - t0, 2)
        result = {"job": JOB, "kind": "broaden", "params": p, "release": release, "name": m["name"], "mat": m["mat"],
                  "mt": mt, "sublibrary": sub, "series": series, "timings": timings, "finished_at": now()}
        rkey = f"lake/jobs/{JOB}/result.json"
        s3.put_object(Bucket=BUCKET, Key=rkey, Body=json.dumps(result, indent=1).encode(), ContentType="application/json")
        update(status="done", finished_at=now(), result_key=rkey, timings=timings,
               summary={"name": m["name"], "mat": m["mat"], "series": [{k: v for k, v in s.items()} for s in series]})
        print(json.dumps({"done": JOB, "timings": timings}))
    except Exception as e:  # noqa: BLE001
        msg = str(e) if isinstance(e, Failed) else f"{type(e).__name__}: {e}"
        timings["total_s"] = round(time.time() - t0, 2)
        update(status="failed", finished_at=now(), error=msg[-4000:], timings=timings)
        print("failed:", msg)
        sys.exit(1)


if __name__ == "__main__":
    main()
