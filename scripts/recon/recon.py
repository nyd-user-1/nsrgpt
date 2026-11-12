"""Brief 74 (Elpis lane B): every served release's cross sections reconstructed through the resonance range in advance
with PREPRO 2023, stored and served the way NNDC's POINT releases are. Runs on recon boxes (scripts/recon/userdata.sh:
the parse box's venv plus PREPRO built as on nsr-jobs-1), never on the Mac.

  recon.py list <rel>...      the materials with resolved or unresolved resonance parameters (LRU 1 or 2 in
                              lake/endfb/<rel>/res_ranges/), heaviest first -> lake/endfb/<rel>/recon/materials.json
  recon.py tapes <rel>...     their MF1, MF2 and MF3 lines from lake/endfb/<rel>/records/, one gzip tape a material
                              -> lake/endfb/<rel>/recon/tapes/<id>.endf.gz
  recon.py run [--jobs N] [--stale S] [--ids a,b] <rel>...
                              one worker a core takes materials from the releases' lists, heaviest first, each claimed
                              with an S3 conditional write (recon/claim/<id>) so no two workers or boxes share one:
                              linear, recent (0 K), sigma1 (293.6 K); every MF3 section at both temperatures
                              -> recon/out/<id>.parquet, timings or the error -> recon/status/<id>.json. A material with a
                              status object is done; a rerun does the rest. --stale S takes over claims older than S
                              seconds that never got a status (a box that died).
  recon.py serve <rel>...     once every listed material has a status: lake/serve/endf/<rel>-recon-<T>/xs/ (serve.py
                              endf_point's columns and thinning), its nsr.endf_serve_xs partition, and the API's xs_index
                              and xs_series files (serve.py point_files), for T 0K and 293.6K -> recon/manifest.json
  recon.py check <rel>...     listed, tapes, done, failed, served, per release (printed as JSON)

Settings (brief 74, B1): linear, recent and sigma1 with 0.1% tolerances, the cards scripts/jobs/box/broaden.py uses;
recent reconstructs the unresolved range's average cross sections, sigma1 copies that range unbroadened (PREPRO's
defaults). The material id is crc32("<sublibrary>/<file_name>") and the MAT: one MAT can sit in several sublibraries.
"""
import argparse
import collections
import datetime
import gzip
import io
import json
import multiprocessing as mp
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import zlib
from concurrent.futures import ThreadPoolExecutor

import boto3
import botocore.exceptions
import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.fs as pafs
import pyarrow.parquet as pq

B, REGION = "nsr-lake-613473203863", "us-east-2"
PREPRO = "/opt/prepro/bin-o2" if os.path.isdir("/opt/prepro/bin-o2") else "/opt/prepro/bin"
ERR = 1.0e-3  # 0.1 per cent: linearizing, reconstruction and thinning tolerance (broaden.py's)
T2 = float(os.environ.get("RECON_T2", "293.6"))  # sigma1's temperature; RECON_T2=300 RECON_SUFFIX=-300K for a B1 variant
SUFFIX = os.environ.get("RECON_SUFFIX", "")  # out, status and claim prefixes of a variant: out<SUFFIX>/ ...
HOT = f"{T2:g}K"
TEMPS = {"0K": 0.0, HOT: T2}  # 0 K is recent's output, HOT sigma1's
WORK = "/data/recon"
HOST = socket.gethostname()
POINT_STEPS = 20000  # serve.py endf_point: sections over POINT_MAX points keep the lowest and highest in each step
POINT_MAX = 2 * POINT_STEPS
_s3 = {}


def s3():
    """One client a process (workers are forked)."""
    pid = os.getpid()
    if pid not in _s3:
        _s3[pid] = boto3.client("s3", region_name=REGION)
    return _s3[pid]


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_json(key):
    return json.loads(s3().get_object(Bucket=B, Key=key)["Body"].read())


def put_json(key, obj):
    s3().put_object(Bucket=B, Key=key, Body=json.dumps(obj, indent=1).encode(), ContentType="application/json")


def exists(key):
    try:
        return s3().head_object(Bucket=B, Key=key)
    except botocore.exceptions.ClientError as e:
        if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def keys(prefix):
    out = []
    for page in s3().get_paginator("list_objects_v2").paginate(Bucket=B, Prefix=prefix):
        out += [o["Key"] for o in page.get("Contents", [])]
    return out


def mid(sub, file_name, mat):
    return f"{zlib.crc32(f'{sub}/{file_name}'.encode()):08x}-{mat}"


def pre(rel):
    return f"lake/endfb/{rel}/recon"


def dataset(prefix):
    return ds.dataset(f"{B}/{prefix}", filesystem=pafs.S3FileSystem(region=REGION), format="parquet")


# ---------- list ----------
def list_rel(rel):
    rr = dataset(f"lake/endfb/{rel}/res_ranges/").to_table(
        columns=["sublibrary", "file_name", "mat", "lru", "lrf", "el_ev", "eh_ev", "n_resonances"]).to_pylist()
    # keyed by (file_name, mat): the serving table names the sublibrary as ENDF/B does (alphas, atomic_relax), while
    # res_ranges and records keep the archive's folder (alphas-version.VIII.1, (root))
    mats = {(m["file_name"], m["mat"]): m for m in dataset(f"lake/serve/endf/{rel}/materials/").to_table(
        columns=["sublibrary", "file_name", "mat", "name", "z", "a", "liso", "za"]).to_pylist()}
    by, any_ = {}, set()
    for r in rr:
        k = (r["sublibrary"], r["file_name"], r["mat"])
        any_.add(k)
        if r["lru"] in (1, 2):
            by.setdefault(k, []).append(r)
    out, unnamed = [], []
    for k, ranges in by.items():
        m = mats.get(k[1:])
        if m is None:
            unnamed.append(list(k))
        n_res = sum(r["n_resonances"] or 0 for r in ranges if r["lru"] == 1)
        out.append({"id": mid(*k), "sublibrary": m["sublibrary"] if m else k[0], "raw_sub": k[0],
                    "file_name": k[1], "mat": k[2],
                    "name": m and m["name"], "z": m and m["z"], "a": m and m["a"], "liso": m and m["liso"],
                    "za": m and m["za"], "n_resonances": n_res, "urr": any(r["lru"] == 2 for r in ranges),
                    "ranges": [[r["lru"], r["lrf"], r["el_ev"], r["eh_ev"]] for r in ranges],
                    "cost": n_res + (2000 if any(r["lru"] == 2 for r in ranges) else 0)})
    out.sort(key=lambda m: -m["cost"])
    doc = {"release": rel, "built_at": now(), "res_ranges_materials": len(any_), "listed": len(out),
           "rule": "materials with an LRU 1 (resolved) or LRU 2 (unresolved) range in endfb_res_ranges",
           "not_in_serve_materials": unnamed, "materials": out}
    put_json(f"{pre(rel)}/materials.json", doc)
    print(json.dumps({"list": rel, "res_ranges_materials": len(any_), "listed": len(out), "unnamed": len(unnamed)}),
          flush=True)
    return doc


# ---------- tapes ----------
ZERO = f"{0.0:11.4E}" * 2 + f"{0:11d}" * 4


def tapes(rel):
    """Stream the release's records once (MF 0 to 3, listed MATs), one line file a material on disk, then each sorted
    by line_no into a tape the way broaden.py's tape() writes one: TPID, MF1-3 lines, the FEND closing each kept file,
    MEND, TEND."""
    t0 = time.time()
    doc = get_json(f"{pre(rel)}/materials.json")
    want = {(m.get("raw_sub", m["sublibrary"]), m["file_name"], m["mat"]): m["id"] for m in doc["materials"]}
    d = f"{WORK}/{rel}/lines"
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    mats = pa.array(sorted({k[2] for k in want}), pa.int32())
    n_lines = 0
    fs = pafs.S3FileSystem(region=REGION)
    for key in sorted(k for k in keys(f"lake/endfb/{rel}/records/") if k.endswith(".parquet")):
        # one row group at a time (the dataset scanner's read-ahead ran out of the box's 8 GB on JEFF-3.3)
        pf = pq.ParquetFile(fs.open_input_file(f"{B}/{key}"))
        for batch in pf.iter_batches(batch_size=200_000, use_threads=False,
                                     columns=["sublibrary", "file_name", "mat", "mf", "line_no", "text"]):
            mask = pc.and_(pc.less_equal(batch.column("mf"), 3), pc.is_in(batch.column("mat"), value_set=mats))
            c = batch.filter(mask).to_pydict()
            hs = {}
            for sub, fn, mat, mf, ln, text in zip(c["sublibrary"], c["file_name"], c["mat"], c["mf"], c["line_no"],
                                                  c["text"]):
                k = want.get((sub, fn, mat))
                if k is None:
                    continue
                h = hs.get(k)
                if h is None:
                    h = hs[k] = open(f"{d}/{k}", "a", encoding="latin-1")
                h.write(f"{ln}\t{mf}\t{text}\n")
                n_lines += 1
            for h in hs.values():
                h.close()

    def one(m):
        p = f"{d}/{m['id']}"
        if not os.path.exists(p):
            return m["id"], 0
        rows = []
        with open(p, encoding="latin-1") as f:
            for ln in f:
                a, b, text = ln.rstrip("\n").split("\t", 2)
                rows.append((int(a), int(b), text))
        rows.sort()
        out, prev = [f"{'nsr recon ' + rel + ' ' + (m['name'] or str(m['mat'])):66s}{1:4d}{0:2d}{0:3d}{0:5d}"], None
        for _, mf, text in rows:
            if mf in (1, 2, 3):
                out.append(text)
                prev = mf
            elif mf == 0 and prev in (1, 2, 3):
                out.append(text)
                prev = 0
        out += [f"{ZERO}{0:4d}{0:2d}{0:3d}{0:5d}", f"{ZERO}{-1:4d}{0:2d}{0:3d}{0:5d}"]
        s3().put_object(Bucket=B, Key=f"{pre(rel)}/tapes/{m['id']}.endf.gz",
                        Body=gzip.compress(("\n".join(out) + "\n").encode("latin-1"), 6))
        os.remove(p)
        return m["id"], len(out)

    with ThreadPoolExecutor(16) as ex:
        res = list(ex.map(one, doc["materials"]))
    missing = [i for i, n in res if n == 0]
    put_json(f"{pre(rel)}/tapes.json", {"release": rel, "built_at": now(), "listed": len(doc["materials"]),
                                         "tapes": len(res) - len(missing), "missing": missing, "lines": n_lines,
                                         "seconds": round(time.time() - t0, 1)})
    shutil.rmtree(d, ignore_errors=True)
    print(json.dumps({"tapes": rel, "listed": len(doc["materials"]), "written": len(res) - len(missing),
                      "missing": len(missing), "lines": n_lines, "s": round(time.time() - t0, 1)}), flush=True)


# ---------- PREPRO ----------
def card(*fields):  # copied from scripts/jobs/box/broaden.py
    return "".join(f"{v:11.4E}" if isinstance(v, float) else f"{v:11d}" for v in fields)


class Failed(Exception):
    pass


def prog(name, inp, wd, out, timeout):
    """Run one PREPRO program in wd with <NAME>.INP; its output tape must exist and hold data."""
    with open(f"{wd}/{name.upper()}.INP", "w") as f:
        f.write(inp)
    t = time.time()
    try:
        p = subprocess.run([f"{PREPRO}/{name}"], cwd=wd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                           errors="replace", timeout=timeout)
        text, code = p.stdout, p.returncode
    except subprocess.TimeoutExpired as e:
        raise Failed(f"{name} timed out after {timeout} s")
    ok = os.path.exists(f"{wd}/{out}") and os.path.getsize(f"{wd}/{out}") > 1000
    if code != 0 or not ok:
        lst = f"{wd}/{name.upper()}.LST"
        text = (open(lst, errors="replace").read() if os.path.exists(lst) else "") + (text or "")
        raise Failed(f"{name} failed (exit {code})\n" + "\n".join(text.splitlines()[-30:]))
    return round(time.time() - t, 2)


ENGINE = os.environ.get("RECON_ENGINE", "njoy")  # njoy (B1's choice; PREPRO when NJOY refuses a material), or prepro
NJOY = "/opt/njoy/build/njoy"
NJ_ERR, NJ_ERRTHN = "0.0005", "0.001"  # B1: reconr 0.05% (JANIS's resonance-range values), broadr thinning 0.1%


def njoy(mat, wd, timeout):
    """NJOY2016: reconr (tape20 -> tape21, 0 K, err ERR with its defaults errmax 10 err, errint err/20000), then broadr
    (tape21 -> tape22 at T2, errthn ERR, its default thnmax)."""
    e = os.environ  # B1 experiments: NJ_ERR, NJ_ERRMAX, NJ_ERRINT (reconr card 4), NJ_ERRTHN (broadr card 3); 0 = default
    err, emax, eint = e.get("NJ_ERR", NJ_ERR), e.get("NJ_ERRMAX", "0"), e.get("NJ_ERRINT", "0")
    inp = (f"reconr\n20 21\n'nsr recon'/\n{mat} 0/\n{err} 0. {emax} {eint}/\n0/\n"
           f"broadr\n20 21 22\n{mat} 1 0 0 0./\n{e.get('NJ_ERRTHN', NJ_ERRTHN)}/\n{T2}/\n0/\nstop\n")
    t = time.time()
    try:
        p = subprocess.run([NJOY], cwd=wd, input=inp, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                           errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired:
        raise Failed(f"njoy timed out after {timeout} s")
    ok = all(os.path.exists(f"{wd}/{x}") and os.path.getsize(f"{wd}/{x}") > 1000 for x in ("tape21", "tape22"))
    if p.returncode != 0 or not ok:
        out = (open(f"{wd}/output", errors="replace").read() if os.path.exists(f"{wd}/output") else "") + p.stdout
        raise Failed(f"njoy failed (exit {p.returncode})\n" + "\n".join(out.splitlines()[-30:]))
    return round(time.time() - t, 2)


EXP = re.compile(r"([0-9.])([+-])([0-9])")


def floats(fields):
    """ENDF 11-column numbers (1.234567+5, 1.23456789, -1.0-10) as a float64 array."""
    s = EXP.sub(r"\1E\2\3", " ".join(fields))
    return np.array(s.split(), dtype=np.float64)


def mf3(path, mat):
    """Every MF3 section of MAT <mat> in an ENDF tape: {mt: (qm, qi, lr, nbt, law, energies, xs)}."""
    secs, cur, tag = {}, None, f"{mat:4d} 3"
    with open(path, encoding="latin-1") as f:
        for ln in f:
            if ln[66:72] != tag:
                continue
            mt = int(ln[72:75])
            if mt == 0:
                continue
            secs.setdefault(mt, []).append(ln.rstrip("\n").ljust(80))
    out = {}
    for mt, lines in secs.items():
        c = [lines[1][i * 11:(i + 1) * 11] for i in range(6)]
        qm, qi = floats(c[:2])
        lr, nr, np_ = int(c[3] or 0), int(c[4]), int(c[5])
        nl = (2 * nr + 5) // 6
        ints = [int(x) for ln in lines[2:2 + nl] for x in (ln[i * 11:(i + 1) * 11] for i in range(6)) if x.strip()]
        f6 = [ln[i * 11:(i + 1) * 11] for ln in lines[2 + nl:] for i in range(6)][:2 * np_]
        v = floats(f6)
        if len(v) != 2 * np_:
            raise Failed(f"MF3 MT{mt}: {len(v)} numbers for {np_} points")
        out[mt] = (float(qm), float(qi), lr, ints[0:2 * nr:2], ints[1:2 * nr:2], v[0::2], v[1::2])
    return out


OUT_SCHEMA = pa.schema([("temp", pa.string()), ("sublibrary", pa.string()), ("file_name", pa.string()),
                        ("mat", pa.int32()), ("mt", pa.int32()), ("qm", pa.float64()), ("qi", pa.float64()),
                        ("lr", pa.int32()), ("interp_nbt", pa.list_(pa.int32())), ("interp_law", pa.list_(pa.int32())),
                        ("n_points", pa.int64()), ("energy_ev", pa.list_(pa.float64())),
                        ("xs_barn", pa.list_(pa.float64()))])


def lists(arrs, typ):
    off = np.zeros(len(arrs) + 1, dtype=np.int32)
    off[1:] = np.cumsum([len(a) for a in arrs])
    vals = np.concatenate([np.asarray(a, dtype=typ) for a in arrs]) if arrs else np.array([], dtype=typ)
    return pa.ListArray.from_arrays(pa.array(off), pa.array(vals))


def material(rel, m, timeout=3600):
    """linear, recent, sigma1 for one material; both temperatures' MF3 to recon/out/<id>.parquet; the status object."""
    wd = f"{WORK}/w/{m['id']}"
    shutil.rmtree(wd, ignore_errors=True)
    os.makedirs(wd)
    t0, tm, st = time.time(), {}, {"id": m["id"], "release": rel, "name": m["name"], "mat": m["mat"], "engine": ENGINE,
                                   "sublibrary": m["sublibrary"], "host": HOST, "started": now()}
    blank = " " * 11 + "\n"
    try:
        body = s3().get_object(Bucket=B, Key=f"{pre(rel)}/tapes/{m['id']}.endf.gz")["Body"].read()
        with open(f"{wd}/ENDFB.IN", "wb") as f:
            f.write(gzip.decompress(body))
        engine = ENGINE
        if engine == "njoy":
            os.symlink("ENDFB.IN", f"{wd}/tape20")
            try:
                tm["njoy_s"] = njoy(m["mat"], wd, timeout)
                outs = (("0K", "tape21"), (HOT, "tape22"))
            except Failed as e:  # e.g. "illegal nsub for reconr" (the standards sublibrary): PREPRO instead
                st["njoy_error"] = str(e)[-1500:]
                engine = "prepro"
        st["engine"] = engine
        if engine == "prepro":
            tm["linear_s"] = prog("linear", card(0, 0, 1.0e-10, 0) + "\nENDFB.IN\nLINEAR.OUT\n" + blank
                                  + card(0.0, ERR) + "\n" + blank, wd, "LINEAR.OUT", timeout)
            tm["recent_s"] = prog("recent", card(0, 1.0e-10, 0, 0, 1, 0) + "\nLINEAR.OUT\nRECENT.OUT\n" + blank
                                  + card(0.0, ERR) + "\n" + blank, wd, "RECENT.OUT", timeout)
            tm["sigma1_s"] = prog("sigma1", card(0, 0, T2, 1.0e-10, 1, 0) + "\nRECENT.OUT\nSIGMA1.OUT\n"
                                  + blank + card(0.0, ERR) + "\n" + blank, wd, "SIGMA1.OUT", timeout)
            outs = (("0K", "RECENT.OUT"), (HOT, "SIGMA1.OUT"))
        cols = {k: [] for k in OUT_SCHEMA.names}
        counts = {}
        for temp, path in outs:
            secs = mf3(f"{wd}/{path}", m["mat"])
            if not secs:
                raise Failed(f"no MF3 sections for MAT {m['mat']} in {path}")
            counts[temp] = {"sections": len(secs), "points": int(sum(len(s[5]) for s in secs.values()))}
            for mt in sorted(secs):
                qm, qi, lr, nbt, law, e, x = secs[mt]
                for k, v in (("temp", temp), ("sublibrary", m["sublibrary"]), ("file_name", m["file_name"]),
                             ("mat", m["mat"]), ("mt", mt), ("qm", qm), ("qi", qi), ("lr", lr), ("interp_nbt", nbt),
                             ("interp_law", law), ("n_points", len(e)), ("energy_ev", e), ("xs_barn", x)):
                    cols[k].append(v)
        arrays = []
        for f in OUT_SCHEMA:
            if f.name in ("energy_ev", "xs_barn"):
                arrays.append(lists(cols[f.name], np.float64))
            elif f.name in ("interp_nbt", "interp_law"):
                arrays.append(lists(cols[f.name], np.int32))
            else:
                arrays.append(pa.array(cols[f.name], f.type))
        buf = io.BytesIO()
        pq.write_table(pa.Table.from_arrays(arrays, schema=OUT_SCHEMA), buf, compression="zstd")
        s3().put_object(Bucket=B, Key=f"{pre(rel)}/out{SUFFIX}/{m['id']}.parquet", Body=buf.getvalue())
        tm["total_s"] = round(time.time() - t0, 2)
        st.update(ok=True, timings=tm, counts=counts, bytes=buf.tell(), finished=now())
    except Exception as e:  # noqa: BLE001
        msg = str(e) if isinstance(e, Failed) else f"{type(e).__name__}: {e}"
        tm["total_s"] = round(time.time() - t0, 2)
        st.update(ok=False, error=msg[-4000:], timings=tm, finished=now())
    put_json(f"{pre(rel)}/status{SUFFIX}/{m['id']}.json", st)
    shutil.rmtree(wd, ignore_errors=True)
    return st


# ---------- run ----------
def claim(rel, m, stale):
    ck = f"{pre(rel)}/claim{SUFFIX}/{m['id']}"
    if exists(f"{pre(rel)}/status{SUFFIX}/{m['id']}.json"):
        return False
    h = exists(ck)
    if h is not None:
        age = time.time() - h["LastModified"].timestamp()
        if not stale or age < stale:
            return False
        s3().put_object(Bucket=B, Key=ck, Body=f"{HOST} {now()} (stale takeover)".encode())
        return True
    try:
        s3().put_object(Bucket=B, Key=ck, Body=f"{HOST} {now()}".encode(), IfNoneMatch="*")
        return True
    except botocore.exceptions.ClientError as e:
        if e.response["Error"]["Code"] in ("PreconditionFailed", "ConditionalRequestConflict", "412"):
            return False
        raise


def worker(k, queue, stale, log):
    done = 0
    with open(log, "a") as lf:
        for rel, m in queue:
            if not claim(rel, m, stale):
                continue
            st = material(rel, m)
            done += 1
            lf.write(json.dumps({"w": k, "rel": rel, "id": m["id"], "name": m["name"], "ok": st["ok"],
                                 "s": st["timings"].get("total_s"), "err": (st.get("error") or "")[:200]}) + "\n")
            lf.flush()
    return done


def run(rels, jobs, stale, ids):
    queue = []
    for rel in rels:
        doc = get_json(f"{pre(rel)}/materials.json")
        queue += [(rel, m) for m in doc["materials"] if not ids or m["id"] in ids or str(m["mat"]) in ids]
    queue.sort(key=lambda q: -q[1]["cost"])
    os.makedirs(WORK, exist_ok=True)
    log = f"{WORK}/run.log"
    with mp.get_context("fork").Pool(jobs) as pool:
        n = sum(pool.starmap(worker, [(k, queue, stale, log) for k in range(jobs)]))
    print(json.dumps({"run": rels, "queue": len(queue), "processed_here": n}), flush=True)


# ---------- serve ----------
SERVE_SCHEMA = pa.schema([("release", pa.string()), ("sublibrary", pa.string()), ("name", pa.string()),
                          ("z", pa.int32()), ("a", pa.int32()), ("liso", pa.int32()), ("za", pa.float64()),
                          ("mat", pa.int32()), ("mt", pa.int32()), ("n_points", pa.int64()), ("e_min", pa.float64()),
                          ("e_max", pa.float64()), ("interp_nbt", pa.list_(pa.int32())),
                          ("interp_law", pa.list_(pa.int32())), ("qm", pa.float64()), ("qi", pa.float64()),
                          ("lr", pa.int32()), ("energy_ev", pa.list_(pa.float64())), ("xs_barn", pa.list_(pa.float64())),
                          ("n_served", pa.int64()), ("thinned", pa.bool_())])


def thin(e, x):
    """serve.py endf_point's thinning: over POINT_MAX points, keep the lowest and highest cross section in each of
    POINT_STEPS equal steps of log energy, plus both ends."""
    n = len(e)
    if n <= POINT_MAX:
        return None
    l0, l1 = np.log(max(e[0], 1e-30)), np.log(max(e[-1], 1e-30))
    b = np.minimum(np.floor((np.log(np.maximum(e, 1e-30)) - l0) / max(l1 - l0, 1e-12) * POINT_STEPS).astype(np.int64),
                   POINT_STEPS - 1)
    order = np.lexsort((x, b))
    bs = b[order]
    starts = np.flatnonzero(np.r_[True, bs[1:] != bs[:-1]])
    ends = np.r_[starts[1:] - 1, len(bs) - 1]
    return np.unique(np.r_[order[starts], order[ends], 0, n - 1])


def serve(rels):
    sys.path.insert(0, "/opt/parse/scripts/serve-structure")
    sys.path.insert(0, "/opt/parse/scripts/box")
    import serve as sv  # noqa: E402  scripts/parse/serve-structure/serve.py
    for rel in rels:
        t0 = time.time()
        doc = get_json(f"{pre(rel)}/materials.json")
        listed = {m["id"]: m for m in doc["materials"]}
        status_ids = {k.rsplit("/", 1)[-1][:-5] for k in keys(f"{pre(rel)}/status{SUFFIX}/")}
        out_ids = {k.rsplit("/", 1)[-1][:-8] for k in keys(f"{pre(rel)}/out{SUFFIX}/")}
        waiting = sorted(set(listed) - status_ids)
        if waiting:
            print(json.dumps({"serve": rel, "waiting": len(waiting)}), flush=True)
            continue
        failed = sorted(set(listed) - out_ids)
        ok = sorted((m for i, m in listed.items() if i in out_ids),
                    key=lambda m: (m["sublibrary"], m["z"] or 0, m["a"] or 0, m["liso"] or 0, m["mat"]))
        man = {"release": rel, "built_at": now(), "listed": len(listed), "reconstructed": len(ok),
               "failed": [{"id": i, "name": listed[i]["name"], "mat": listed[i]["mat"],
                           "error": get_json(f"{pre(rel)}/status{SUFFIX}/{i}.json").get("error", "")[:600]} for i in failed],
               "method": "NJOY2016 (njoy/NJOY2016 ab27c64): reconr err 0.0005 (errmax 10 err, errint err/20000), broadr to "
                         "293.6 K, errthn 0.001; where NJOY refuses a material, PREPRO 2023 (linear, recent, sigma1, 0.1%)",
               "engines": dict(collections.Counter(get_json(f"{pre(rel)}/status{SUFFIX}/{i}.json").get("engine", "prepro")
                                                   for i in sorted(out_ids & set(listed)))), "served": {}}
        sv.manifest = lambda key, base, tables: None  # recon/manifest.json records it; no shared read-modify-write
        names = {temp: f"{rel}-recon-{temp}" for temp in TEMPS}  # NNDC's own stay <rel>-point-<T>
        dirs = {temp: f"{WORK}/serve/{names[temp]}" for temp in TEMPS}
        writers, stats = {}, {}
        for temp, d in dirs.items():
            shutil.rmtree(d, ignore_errors=True)
            os.makedirs(d)
            writers[temp] = pq.ParquetWriter(f"{d}/part-00000.parquet", SERVE_SCHEMA, compression="snappy")
            stats[temp] = {"rows": 0, "thinned": 0, "points": 0, "served": 0}
        for m in ok:  # one read a material, both temperatures written
            t = pq.read_table(io.BytesIO(s3().get_object(Bucket=B, Key=f"{pre(rel)}/out{SUFFIX}/{m['id']}.parquet")["Body"].read()))
            by = {temp: [] for temp in TEMPS}
            for r in t.to_pylist():
                by[r["temp"]].append(r)
            for temp, rows in by.items():
                rows.sort(key=lambda r: r["mt"])
                cols, s = {k: [] for k in SERVE_SCHEMA.names}, stats[temp]
                for r in rows:
                    e, x = np.asarray(r["energy_ev"]), np.asarray(r["xs_barn"])
                    keep = thin(e, x)
                    nbt, law = r["interp_nbt"], r["interp_law"]
                    if keep is not None:
                        e, x = e[keep], x[keep]
                        nbt, law = ([len(e)], [law[0]]) if len(law) == 1 else (None, None)
                        s["thinned"] += 1
                    vals = {"release": names[temp], "sublibrary": m["sublibrary"], "name": m["name"], "z": m["z"],
                            "a": m["a"], "liso": m["liso"], "za": m["za"], "mat": m["mat"], "mt": r["mt"],
                            "n_points": r["n_points"], "e_min": float(r["energy_ev"][0]),
                            "e_max": float(r["energy_ev"][-1]), "interp_nbt": nbt, "interp_law": law, "qm": r["qm"],
                            "qi": r["qi"], "lr": r["lr"], "energy_ev": e.tolist(), "xs_barn": x.tolist(),
                            "n_served": len(e), "thinned": keep is not None}
                    for k, v in vals.items():
                        cols[k].append(v)
                    s["points"] += r["n_points"]
                    s["served"] += len(e)
                if rows:
                    writers[temp].write_table(pa.table(cols, schema=SERVE_SCHEMA), row_group_size=32)
                    s["rows"] += len(rows)
        for temp, name in names.items():
            writers[temp].close()
            path = f"{dirs[temp]}/part-00000.parquet"
            prefix = f"lake/serve/endf/{name}/xs/"
            sv.clear(prefix)
            s3().upload_file(path, B, f"{prefix}part-00000.parquet")
            n_reg, _ = sv.register("endf_serve_xs", pq.read_schema(path), prefix,
                                   "ENDF/B MF3 cross sections as point arrays, one row each", partition=name, drop=False)
            sv.point_files(name)
            files = {p: sum(int(s3().head_object(Bucket=B, Key=k)["ContentLength"]) for k in keys(
                f"lake/serve/endf/{name}/{p}/")) for p in ("xs_index", "xs_series")}
            s = stats[temp]
            man["served"][temp] = {"release": name, "rows": s["rows"], "registered_rows": n_reg,
                                   "thinned_sections": s["thinned"], "points": s["points"], "points_served": s["served"],
                                   "files": files, "xs_bytes": os.path.getsize(path)}
            shutil.rmtree(dirs[temp], ignore_errors=True)
            print(json.dumps({"served": name, "rows": s["rows"], "registered": n_reg, "thinned": s["thinned"]}), flush=True)
        man["seconds"] = round(time.time() - t0, 1)
        put_json(f"{pre(rel)}/manifest.json", man)


# ---------- check ----------
def check(rels):
    out = []
    for rel in rels:
        try:
            doc = get_json(f"{pre(rel)}/materials.json")
        except botocore.exceptions.ClientError:
            out.append({"release": rel, "listed": None})
            continue
        st = len(keys(f"{pre(rel)}/status{SUFFIX}/"))
        ok = len(keys(f"{pre(rel)}/out{SUFFIX}/"))
        tp = len(keys(f"{pre(rel)}/tapes/"))
        man = exists(f"{pre(rel)}/manifest.json")
        out.append({"release": rel, "res_ranges_materials": doc["res_ranges_materials"], "listed": doc["listed"],
                    "tapes": tp, "status": st, "ok": ok, "failed": st - ok, "served": bool(man)})
    print(json.dumps(out, indent=1))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["list", "tapes", "run", "serve", "check"])
    ap.add_argument("releases", nargs="+")
    ap.add_argument("--jobs", type=int, default=os.cpu_count())
    ap.add_argument("--stale", type=int, default=0)
    ap.add_argument("--ids", default="")
    a = ap.parse_args()
    if a.step == "list":
        for r in a.releases:
            list_rel(r)
    elif a.step == "tapes":
        for r in a.releases:
            tapes(r)
    elif a.step == "run":
        run(a.releases, a.jobs, a.stale, set(x for x in a.ids.split(",") if x))
    elif a.step == "serve":
        serve(a.releases)
    else:
        check(a.releases)
