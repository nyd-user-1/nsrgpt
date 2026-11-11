"""nsr-endf-parse (brief 64): ENDF Files 4, 5, 6, 9, 10, 12, 13, 14 and 15 of every release to numeric rows, fanned out
one invocation per material. One function, a job per event:

  {"job": "split", "release": R, "part": "part-00003.parquet"}
      One endfb_records part -> the lines of MF 4-15 of each material it holds (with their SEND lines), one text
      fragment per material run at lake/_work/endf-split/<R>/<id>/<part>-<run>.endf, and the part's index
      lake/_work/endf-split/<R>/_index/<part>.json (id, file_name, sublibrary, mat, lines, lines by MF).
  {"job": "parse", "release": R, "id": ..., "file_name": ..., "sublibrary": ..., "mat": ..., ["chunk": [i, n]]}
      A material's fragments, in order, cut into sections; each section with MF in WANT is read by endf-parserpy 0.18.0
      and becomes rows of seven tables, one Parquet file per material per table at lake/endfb/<R>/<table>/<id>.parquet;
      its summary (sections, values and rows by MF and MT, energies, laws, rejects, seconds) at
      lake/endfb/<R>/mf4_15/sections/<id>.json. With "chunk" [i, n] only every n-th section from i (a material too long
      for one invocation), written as <id>.c<i>of<n>.
  {"job": "fanout", "release": R, "stage": "split" | "parse", ["ids": [...]], ["chunks": n], ["missing": true]}
      Invokes this function asynchronously for every records part (split) or every material in the split indexes
      (parse, longest first); "missing" sends only the materials with no summary yet.
  {"job": "collect", "release": R}
      Reads every summary, registers the tables (Athena, partition release=R), counts them, compares with
      endfb_sections, writes lake/endfb/<R>/mf4_15/materials.json, rejects.json and the manifest's "mf4_15" section.
  {"job": "probe", "release": R, "id": ..., "mf": 6, "limit": 2}
      The structure endf-parserpy returns for a few sections (keys, types, lengths), for writing the row builders.
"""
import collections
import concurrent.futures as cf
import hashlib
import io
import json
import logging
import os
import re
import time

import boto3
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
from botocore.config import Config
from endf_parserpy import EndfParserPy

logging.disable(logging.WARNING)  # endf-parserpy warns on every nonstandard constant field; rejections are counted

BUCKET = os.environ.get("BUCKET", "nsr-lake-613473203863")
REGION = "us-east-2"
FN = os.environ.get("AWS_LAMBDA_FUNCTION_NAME", "nsr-endf-parse")
WORKGROUP = "nsrgpt"
DATABASE = "nsr"
WANT = (4, 5, 6, 9, 10, 12, 13, 14, 15)
TABLE_OF_MF = {4: "ang", 5: "edist", 6: "eang", 9: "mult", 10: "mult", 12: "photon_xs", 13: "photon_xs",
               14: "photon_ang", 15: "photon_edist"}
s3 = boto3.client("s3", region_name=REGION, config=Config(max_pool_connections=64, retries={"max_attempts": 10}))
lam = boto3.client("lambda", region_name=REGION, config=Config(max_pool_connections=64, retries={"max_attempts": 10}))

S, D, I, B = pa.string(), pa.float64(), pa.int32(), pa.bool_()
ATHENA_TYPE = {S: "string", D: "double", I: "int", B: "boolean"}
HEAD = [("release", S), ("sublibrary", S), ("file_name", S), ("mat", I)]
SCHEMAS = {
    "ang": pa.schema(HEAD + [
        ("mt", I), ("ltt", I), ("lct", I), ("li", I), ("e_seq", I), ("e_ev", D), ("e_interpolation", I), ("form", S),
        ("l", I), ("mu", D), ("value", D), ("interpolation", I)]),
    "edist": pa.schema(HEAD + [
        ("mt", I), ("subsection", I), ("lf", I), ("u_ev", D), ("kind", S), ("e_seq", I), ("e_in_ev", D),
        ("e_interpolation", I), ("e_out_ev", D), ("value", D), ("interpolation", I), ("params", S)]),
    "eang": pa.schema(HEAD + [
        ("mt", I), ("lct", I), ("product_seq", I), ("zap", D), ("awp", D), ("lip", I), ("law", I), ("lang", I),
        ("lep", I), ("quantity", S), ("e_seq", I), ("e_in_ev", D), ("e_interpolation", I), ("e_out_ev", D),
        ("mu_or_l", D), ("value", D), ("interpolation", I), ("params", S)]),
    "mult": pa.schema(HEAD + [
        ("mf", I), ("mt", I), ("subsection", I), ("izap", D), ("lis", I), ("lfs", I), ("qm", D), ("qi", D),
        ("e_seq", I), ("e_ev", D), ("value", D), ("interpolation", I)]),
    "photon_xs": pa.schema(HEAD + [
        ("mf", I), ("mt", I), ("lo", I), ("lg", I), ("subsection", I), ("kind", S), ("eg_ev", D), ("es_ev", D),
        ("lp", I), ("lf", I), ("level_ev", D), ("e_seq", I), ("e_ev", D), ("value", D), ("interpolation", I)]),
    "photon_ang": pa.schema(HEAD + [
        ("mt", I), ("li", I), ("ltt", I), ("photon_seq", I), ("eg_ev", D), ("es_ev", D), ("form", S), ("e_seq", I),
        ("e_ev", D), ("e_interpolation", I), ("l", I), ("mu", D), ("value", D), ("interpolation", I)]),
    "photon_edist": pa.schema(HEAD + [
        ("mt", I), ("subsection", I), ("lf", I), ("kind", S), ("e_seq", I), ("e_in_ev", D), ("e_interpolation", I),
        ("eg_ev", D), ("value", D), ("interpolation", I)]),
}
# The incident-energy column of each table (the route's emin/emax cut).
E_COL = {"ang": "e_ev", "edist": "e_in_ev", "eang": "e_in_ev", "mult": "e_ev", "photon_xs": "e_ev",
         "photon_ang": "e_ev", "photon_edist": "e_in_ev"}


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def mat_id(sublibrary, file_name, mat):
    """A material's key in the lake: the file's base name, the MAT and 8 hex of sha1(sublibrary|file_name|mat)."""
    base = re.sub(r"[^A-Za-z0-9._+-]", "_", (file_name or "").rsplit("/", 1)[-1])[:80]
    h = hashlib.sha1(f"{sublibrary}|{file_name}|{mat}".encode()).hexdigest()[:8]
    return f"{base}.{mat}.{h}"


def put_json(key, obj):
    s3.put_object(Bucket=BUCKET, Key=key, Body=json.dumps(obj, separators=(",", ":"), default=str).encode(),
                  ContentType="application/json")


def get_json(key):
    return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())


def list_keys(prefix):
    out = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=prefix):
        out += [(o["Key"], o["Size"]) for o in page.get("Contents", [])]
    return out


# ---------- split: one records part -> per-material fragments of MF 4-15 ----------
def split(ev):
    t0 = time.time()
    release, part = ev["release"], ev["part"]
    stem = part.rsplit(".", 1)[0]
    local = f"/tmp/{release}-{part}"  # the managed layer's pyarrow has no S3 filesystem: the part goes to /tmp
    s3.download_file(BUCKET, f"lake/endfb/{release}/records/{part}", local)
    pf = pq.ParquetFile(local)
    want = pa.array(WANT, pa.int32())
    index, runs = [], collections.Counter()
    pool = cf.ThreadPoolExecutor(32)
    futs = []
    cur, buf, by_mf = None, [], collections.Counter()
    rows_in = 0

    def flush():
        if cur is None or not buf:
            return
        sub, fn, mat = cur
        i = mat_id(sub, fn, mat)
        runs[i] += 1
        key = f"lake/_work/endf-split/{release}/{i}/{stem}-{runs[i]:03d}.endf"
        body = ("\n".join(buf) + "\n").encode("latin-1", "replace")
        futs.append(pool.submit(s3.put_object, Bucket=BUCKET, Key=key, Body=body))
        index.append({"id": i, "file_name": fn, "sublibrary": sub, "mat": mat, "lines": len(buf),
                      "by_mf": dict(by_mf), "key": key})

    for b in pf.iter_batches(batch_size=1_000_000, columns=["sublibrary", "file_name", "mat", "mf", "text"]):
        rows_in += b.num_rows
        b = b.filter(pc.is_in(b.column("mf"), value_set=want))
        if not b.num_rows:
            continue
        subs, fns, mats, mfs, texts = (b.column(c).to_pylist() for c in ("sublibrary", "file_name", "mat", "mf", "text"))
        for sub, fn, mat, mf, text in zip(subs, fns, mats, mfs, texts):
            k = (sub, fn, mat)
            if k != cur:
                flush()
                cur, buf, by_mf = k, [], collections.Counter()
            buf.append(text)
            by_mf[mf] += 1
        if len(futs) > 200:
            for f in futs:
                f.result()
            futs = []
    flush()
    for f in futs:
        f.result()
    pool.shutdown()
    os.remove(local)
    out = {"release": release, "part": part, "rows_read": rows_in, "materials": len(index),
           "lines_kept": sum(x["lines"] for x in index), "seconds": round(time.time() - t0, 1), "runs": index}
    put_json(f"lake/_work/endf-split/{release}/_index/{stem}.json", out)
    return {k: v for k, v in out.items() if k != "runs"}


# ---------- endf-parserpy (the same section framing as scripts/parse/endfb/parse.py) ----------
PARSER = EndfParserPy(array_type="list")
TPID = f"{'tape head for one section':66s}{1:4d}{0:2d}{0:3d}{0:5d}"
ZERO = f"{0.0:11.4E}{0.0:11.4E}{0:11d}{0:11d}{0:11d}{0:11d}"
IMPLICIT = re.compile(r"([+-]?(?:\d+\.?\d*|\.\d+))([+-]\d+)")


def tail(mat):
    return [f"{ZERO}{mat:4d}{0:2d}{0:3d}{99999:5d}", f"{ZERO}{0:4d}{0:2d}{0:3d}{0:5d}", f"{ZERO}{-1:4d}{0:2d}{0:3d}{0:5d}"]


def field(f):
    t = f.replace(" ", "")
    if not t:
        return " " * 11
    m = IMPLICIT.fullmatch(t)
    if m:
        v = float(f"{m.group(1)}e{m.group(2)}")
        t = f"{v:.5E}" if v >= 0 else f"{v:.4E}"
    return t.rjust(11)


def squeeze(line):
    """Pre-ENDF-6 floats (2.00000+ 3, 0.     + 0) rewritten in E notation, as parse.py does for B-II and B-III."""
    d = line[:66].ljust(66)
    return "".join(field(f) for f in (d[i:i + 11] for i in range(0, 66, 11))) + line[66:]


def toint(s):
    s = s.strip()
    if s and (s.isdigit() or (s[0] == "-" and s[1:].isdigit())):
        return int(s)
    return None


def sections_of(lines):
    """(mat, mf, mt), body lines, SEND line for every run of lines with one MAT, MF, MT (MT > 0)."""
    cur, sec, prev = None, [], None
    for line in lines:
        tag = line[66:75]
        if tag != prev:
            prev = tag
            k = None
            if len(tag) == 9:
                mat, mf, mt = toint(tag[0:4]), toint(tag[4:6]), toint(tag[6:9])
                if mat and mat > 0 and mf and mf > 0 and mt and mt > 0:
                    k = (mat, mf, mt)
            if k != cur:
                if cur is not None:
                    yield cur, sec, line
                cur, sec = k, []
        if cur is not None:
            sec.append(line)
    if cur is not None:
        yield cur, sec, None


def read_section(mat, mf, mt, body, terminator):
    send = terminator if terminator is not None and len(terminator) >= 75 and terminator[72:75].strip() == "0" \
        else f"{ZERO}{mat:4d}{mf:2d}{0:3d}{99999:5d}"
    send = send[:80]
    global PARSER
    try:
        return PARSER.parse([TPID] + body + [send] + tail(mat), include=((mf, mt),))[mf][mt], False
    except Exception:  # noqa: BLE001
        # A failed parse can leave the parser's lookahead state broken, so that every later section fails with
        # "Not possible to delete elements from LookaheadDict": start a fresh parser and try once more.
        PARSER = EndfParserPy(array_type="list")
        try:
            return PARSER.parse([TPID] + body + [send] + tail(mat), include=((mf, mt),))[mf][mt], False
        except Exception:  # noqa: BLE001
            PARSER = EndfParserPy(array_type="list")
            sq = [squeeze(x) for x in body]
            if sq == body:
                raise
            try:
                return PARSER.parse([TPID] + sq + [send] + tail(mat), include=((mf, mt),))[mf][mt], True
            except Exception:  # noqa: BLE001
                PARSER = EndfParserPy(array_type="list")
                raise


# ---------- endf-parserpy's arrays ----------
def items(v):
    """(ENDF index, value) pairs of an array: a list counts from 1, a dict (an array not starting at 1) by its keys."""
    if v is None:
        return []
    if isinstance(v, dict):
        return sorted(v.items())
    if isinstance(v, (list, tuple)):
        return list(enumerate(v, 1))
    return [(1, v)]


def vals(v):
    return [x for _, x in items(v)]


def get(v, i):
    """Element i (ENDF index) of an array, None when absent."""
    if isinstance(v, dict):
        return v.get(i)
    if isinstance(v, (list, tuple)):
        return v[i - 1] if 0 < i <= len(v) else None
    return None


def interp(obj):
    """(NBT, INT) of a TAB1/TAB2 sub-dict, looked for in the dict itself and one level down."""
    if not isinstance(obj, dict):
        return [], []
    if "NBT" in obj:
        return vals(obj.get("NBT")), vals(obj.get("INT"))
    for v in obj.values():
        if isinstance(v, dict) and "NBT" in v:
            return vals(v.get("NBT")), vals(v.get("INT"))
    return [], []


def laws(nbt, ints, n):
    """The interpolation law of each of n points: INT of the region whose breakpoint NBT is the first >= the point."""
    out, r = [], 0
    if not ints:
        return [None] * n
    for p in range(1, n + 1):
        while r < len(nbt) - 1 and p > nbt[r]:
            r += 1
        out.append(ints[min(r, len(ints) - 1)])
    return out


def num(v, kind=float):
    try:
        return kind(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def jdump(v):
    return json.dumps(v, default=str, separators=(",", ":"))


class Rows:
    """Column lists for one table; extend() takes {column: list of n values or one value for every row}."""

    def __init__(self, schema):
        self.schema = schema
        self.names = schema.names
        self.cols = {k: [] for k in self.names}
        self.n = 0

    def extend(self, cols, n):
        if not n:
            return 0
        for k in self.names:
            v = cols.get(k)
            self.cols[k].extend(v if isinstance(v, list) else [v] * n)
        self.n += n
        return n

    def table(self):
        return pa.Table.from_arrays([pa.array(self.cols[f.name], type=f.type) for f in self.schema], schema=self.schema)


def tab(t, x, y):
    """x, y and per-point laws of a TAB1 dict; x and y named as in the recipe."""
    xs, ys = vals(t.get(x)), vals(t.get(y))
    nbt, ints = interp(t)
    return xs, ys, laws(nbt, ints, len(xs))


# ---------- MF4 ----------
def mf4_rows(T, base, d, info):
    ltt, lct, li = num(d.get("LTT"), int), num(d.get("LCT"), int), num(d.get("LI"), int)
    b = {**base, "ltt": ltt, "lct": lct, "li": li}
    info.update(ltt=ltt, lct=lct, li=li)
    t = T["ang"]
    if li == 1 or ltt == 0:
        return t.extend({**b, "form": "isotropic"}, 1) and 0
    E = d.get("E")
    n = 0
    es = []
    if ltt in (1, 3):
        a = d.get("a") if ltt == 1 else d.get("al")
        tab2 = (d.get("Eint") or d) if ltt == 1 else d.get("leg_int")
        nbt, ints = interp(tab2)
        idx = items(a)
        elaw = laws(nbt, ints, len(idx))
        for (i, coefs), lw in zip(idx, elaw):
            c = vals(coefs)
            e = num(get(E, i))
            es.append(e)
            n += t.extend({**b, "e_seq": i, "e_ev": e, "e_interpolation": lw, "form": "legendre",
                           "l": list(range(1, len(c) + 1)), "value": c}, len(c))
    if ltt in (2, 3):
        tab2 = d.get("energy_table") if ltt == 2 else d.get("ang_int")
        nbt, ints = interp(tab2)
        ang = d.get("angtable")
        off = (num(d.get("NE1"), int) or 1) - 1 if ltt == 3 and isinstance(ang, list) else 0  # E[NE1..] in a list from 1
        idx = [(i + off, at) for i, at in items(ang)]
        elaw = laws(nbt, ints, len(idx))
        for (i, at), lw in zip(idx, elaw):
            mu, f, il = tab(at, "mu", "f")
            e = num(get(E, i))
            es.append(e)
            n += t.extend({**b, "e_seq": i, "e_ev": e, "e_interpolation": lw, "form": "tabulated", "mu": mu,
                           "value": f, "interpolation": il}, len(mu))
    info["energies"] = es
    return n


# ---------- MF5 ----------
def mf5_rows(T, base, d, info):
    t = T["edist"]
    n = 0
    es, lfs = [], []
    for k, c in items(d.get("contribution")):
        lf = num(c.get("LF"), int)
        lfs.append(lf)
        u = num(c.get("U"))
        b = {**base, "subsection": k, "lf": lf, "u_ev": u}
        E, p, il = tab(c.get("p_table") or {}, "E", "p")
        n += t.extend({**b, "kind": "p", "e_seq": list(range(1, len(E) + 1)), "e_in_ev": E, "value": p,
                       "interpolation": il}, len(E))
        if lf == 1:
            nbt, ints = interp(c.get("E_interp"))
            idx = items(c.get("spectrum"))
            elaw = laws(nbt, ints, len(idx))
            Ein = c.get("E")
            for (l, sp), lw in zip(idx, elaw):
                eo, g, gl = tab(sp, "Eout", "g")
                e = num(get(Ein, l))
                es.append(e)
                n += t.extend({**b, "kind": "g", "e_seq": l, "e_in_ev": e, "e_interpolation": lw, "e_out_ev": eo,
                               "value": g, "interpolation": gl}, len(eo))
            continue
        params = {"U": u}
        if lf == 12:
            params.update(EFL=num(c.get("EFL")), EFH=num(c.get("EFH")))
        for tname, y, kind in (("theta_table", "theta", "theta"), ("a_table", "a", "a"), ("b_table", "b", "b"),
                               ("Tm_table", "TM", "tm")):
            if c.get(tname) is None:
                continue
            E2, v, il = tab(c[tname], "E", y)
            es += E2
            n += t.extend({**b, "kind": kind, "e_seq": list(range(1, len(E2) + 1)), "e_in_ev": E2, "value": v,
                           "interpolation": il, "params": jdump(params)}, len(E2))
        if c.get("g_table") is not None:
            x, g, il = tab(c["g_table"], "x", "g")
            n += t.extend({**b, "kind": "gx", "e_seq": list(range(1, len(x) + 1)), "e_out_ev": x, "value": g,
                           "interpolation": il, "params": jdump({"x": "E'/theta(E), dimensionless"})}, len(x))
    info["energies"] = es
    info["laws"] = sorted(set(x for x in lfs if x is not None))
    return n


# ---------- MF6 ----------
KALBACH = ("kalbach_f0", "kalbach_r", "kalbach_a")


def mf6_rows(T, base, d, info):
    t = T["eang"]
    lct = num(d.get("LCT"), int)
    n = 0
    es, products = [], []
    for k, s in items(d.get("subsection")):
        law = num(s.get("LAW"), int)
        zap, awp, lip = num(s.get("ZAP")), num(s.get("AWP")), num(s.get("LIP"), int)
        b = {**base, "lct": lct, "product_seq": k, "zap": zap, "awp": awp, "lip": lip, "law": law}
        y = s.get("yields") or {}
        E, yi, il = tab(y, "Eint", "yi")
        n += t.extend({**b, "quantity": "yield", "e_seq": list(range(1, len(E) + 1)), "e_in_ev": E, "value": yi,
                       "interpolation": il}, len(E))
        lang = num(s.get("LANG"), int)
        lep = num(s.get("LEP"), int)
        products.append({"zap": zap, "law": law, "lang": lang, "lep": lep})
        b.update(lang=lang, lep=lep)
        Ej = s.get("E")
        if law == 1:
            nbt, ints = interp(s)
            idx = items(Ej)
            elaw = laws(nbt, ints, len(idx))
            Ep, bb = s.get("Ep"), s.get("b")
            for (j, e), lw in zip(idx, elaw):
                es.append(num(e))
                eps, bj = get(Ep, j), get(bb, j)
                eo, mu, v, q = [], [], [], []
                for kk, ep in items(eps):
                    bm = list(enumerate(vals(get(bj, kk))))  # m = 0 .. NA
                    if lang == 2:
                        for m, x in bm:
                            eo.append(ep)
                            mu.append(m)
                            v.append(x)
                            q.append(KALBACH[m] if 0 <= m < 3 else f"kalbach_{m}")
                    elif lang is not None and lang >= 11:
                        b0 = bm[0][1] if bm and bm[0][0] == 0 else None
                        eo.append(ep)
                        mu.append(None)
                        v.append(b0)
                        q.append("f0")
                        rest = [x for m, x in bm if m > 0]
                        for a in range(0, len(rest) - 1, 2):
                            eo.append(ep)
                            mu.append(rest[a])
                            v.append(rest[a + 1])
                            q.append("tabulated")
                    else:  # LANG 1: b0 = f0, b_l Legendre coefficients
                        for m, x in bm:
                            eo.append(ep)
                            mu.append(m)
                            v.append(x)
                            q.append("legendre")
                n += t.extend({**b, "quantity": q, "e_seq": j, "e_in_ev": num(e), "e_interpolation": lw,
                               "e_out_ev": eo, "mu_or_l": mu, "value": v, "interpolation": lep}, len(v))
        elif law == 2:
            nbt, ints = interp(s)
            idx = items(Ej)
            elaw = laws(nbt, ints, len(idx))
            A, LANGj = s.get("A"), s.get("LANG")
            for (j, e), lw in zip(idx, elaw):
                es.append(num(e))
                lg = num(get(LANGj, j), int) if isinstance(LANGj, (list, dict)) else lang
                a = vals(get(A, j))
                if lg in (12, 14, 15):
                    mu, v = a[0::2], a[1::2]
                    n += t.extend({**b, "lang": lg, "quantity": "tabulated", "e_seq": j, "e_in_ev": num(e),
                                   "e_interpolation": lw, "mu_or_l": mu, "value": v, "interpolation": lg - 10}, len(v))
                else:
                    n += t.extend({**b, "lang": lg, "quantity": "legendre", "e_seq": j, "e_in_ev": num(e),
                                   "e_interpolation": lw, "mu_or_l": list(range(1, len(a) + 1)), "value": a}, len(a))
        elif law == 5:
            nbt, ints = interp(s)
            idx = items(Ej)
            elaw = laws(nbt, ints, len(idx))
            A, LTP, NL = s.get("A"), s.get("LTP"), s.get("NL")
            spi, lidp = num(s.get("SPI")), num(s.get("LIDP"), int)
            for (j, e), lw in zip(idx, elaw):
                es.append(num(e))
                a = vals(get(A, j))
                p = jdump({"ltp": num(get(LTP, j), int), "nl": num(get(NL, j), int), "spi": spi, "lidp": lidp})
                n += t.extend({**b, "quantity": "cp_elastic", "e_seq": j, "e_in_ev": num(e), "e_interpolation": lw,
                               "mu_or_l": list(range(1, len(a) + 1)), "value": a, "params": p}, len(a))
        elif law == 6:
            n += t.extend({**b, "quantity": "phase_space_apsx", "value": num(s.get("APSX")),
                           "params": jdump({"npsx": num(s.get("NPSX"), int)})}, 1)
        elif law == 7:
            nbt, ints = interp(s.get("E_interpol"))
            idx = items(Ej)
            elaw = laws(nbt, ints, len(idx))
            MU, TB = s.get("mu"), s.get("table")
            for (j, e), lw in zip(idx, elaw):
                es.append(num(e))
                for kk, mu in items(get(MU, j)):
                    eo, f, il = tab(get(get(TB, j), kk) or {}, "Ep", "f")
                    n += t.extend({**b, "quantity": "lab_f", "e_seq": j, "e_in_ev": num(e), "e_interpolation": lw,
                                   "e_out_ev": eo, "mu_or_l": mu, "value": f, "interpolation": il}, len(eo))
        elif law not in (0, 3, 4):
            t.extend({**b, "quantity": "unknown_law", "params": jdump({"keys": sorted(s.keys())})}, 1)
    info["energies"] = es
    info["products"] = products
    info["lct"] = lct
    return n


# ---------- MF9 and MF10 ----------
def mult_rows(T, base, d, info, mf):
    t = T["mult"]
    lis = num(d.get("LIS"), int)
    n = 0
    es, prods = [], []
    y = "Y" if mf == 9 else "sigma"
    for k, s in items(d.get("subsection")):
        E, v, il = tab(s, "E", y)
        es += E
        prods.append({"izap": num(s.get("IZAP")), "lfs": num(s.get("LFS"), int)})
        n += t.extend({**base, "mf": mf, "subsection": k, "izap": num(s.get("IZAP")), "lis": lis,
                       "lfs": num(s.get("LFS"), int), "qm": num(s.get("QM")), "qi": num(s.get("QI")),
                       "e_seq": list(range(1, len(E) + 1)), "e_ev": E, "value": v, "interpolation": il}, len(E))
    info["energies"] = es
    info["products"] = prods
    return n


# ---------- MF12 and MF13 ----------
def photon_xs_rows(T, base, d, info, mf):
    t = T["photon_xs"]
    lo = num(d.get("LO"), int) if mf == 12 else None
    b = {**base, "mf": mf, "lo": lo}
    n = 0
    es = []
    if mf == 12 and lo == 2:
        lg = num(d.get("LG"), int)
        ES, TP, GP = vals(d.get("ES")), vals(d.get("TP")), vals(d.get("GP"))
        bb = {**b, "lg": lg, "lp": num(d.get("LP"), int), "level_ev": num(d.get("ES_NS"))}
        n += t.extend({**bb, "kind": "transition_tp", "subsection": list(range(1, len(ES) + 1)), "es_ev": ES,
                       "value": TP}, len(ES))
        if lg == 2 and GP:
            n += t.extend({**bb, "kind": "transition_gp", "subsection": list(range(1, len(GP) + 1)),
                           "es_ev": ES[:len(GP)], "value": GP}, len(GP))
        info["lo"] = lo
        return n
    if mf == 12:  # LO 1: total yield (NK > 1) and one yield table per photon
        x, y = "Eint", "Y"
        if d.get("Y") is not None:
            E, v, il = tab(d, x, y)
            es += E
            n += t.extend({**b, "kind": "total_yield", "subsection": 0, "e_seq": list(range(1, len(E) + 1)),
                           "e_ev": E, "value": v, "interpolation": il}, len(E))
        EG, ESs, LP, LF = d.get("Eg"), d.get("ES"), d.get("LP"), d.get("LF")
        for k, tb in items(d.get("table")):
            E, v, il = tab(tb, "Eint", "y")
            es += E
            n += t.extend({**b, "kind": "yield", "subsection": k, "eg_ev": num(get(EG, k)), "es_ev": num(get(ESs, k)),
                           "lp": num(get(LP, k), int), "lf": num(get(LF, k), int),
                           "e_seq": list(range(1, len(E) + 1)), "e_ev": E, "value": v, "interpolation": il}, len(E))
    else:  # MF13: total cross section (NK > 1) and one per photon
        if d.get("sigma_tot") is not None:
            E, v, il = tab(d, "E", "sigma_tot")
            es += E
            n += t.extend({**b, "kind": "total_xs", "subsection": 0, "e_seq": list(range(1, len(E) + 1)),
                           "e_ev": E, "value": v, "interpolation": il}, len(E))
        for k, s in items(d.get("subsection")):
            E, v, il = tab(s, "E", "sigma")
            es += E
            n += t.extend({**b, "kind": "xs", "subsection": k, "eg_ev": num(s.get("EG")), "es_ev": num(s.get("ES")),
                           "lp": num(s.get("LP"), int), "lf": num(s.get("LF"), int),
                           "e_seq": list(range(1, len(E) + 1)), "e_ev": E, "value": v, "interpolation": il}, len(E))
    info["energies"] = es
    info["lo"] = lo
    return n


# ---------- MF14 ----------
def mf14_rows(T, base, d, info):
    t = T["photon_ang"]
    li, ltt = num(d.get("LI"), int), num(d.get("LTT"), int)
    b = {**base, "li": li, "ltt": ltt}
    info.update(li=li, ltt=ltt)
    if li == 1:
        t.extend({**b, "form": "isotropic", "params": None}, 1)
        return 0
    n = 0
    es = []
    EG, ESs, E = d.get("EG"), d.get("ES"), d.get("E")
    ni = num(d.get("NI"), int) or 0
    for k in range(1, ni + 1):
        t.extend({**b, "photon_seq": k, "eg_ev": num(get(EG, k)), "es_ev": num(get(ESs, k)), "form": "isotropic"}, 1)
    nk = num(d.get("NK"), int) or 0

    def pick(arr, k, p):
        """Arrays set only for k = NI+1..NK come back as lists from 1 (position p); a dict or a full list is keyed by k."""
        if isinstance(arr, dict):
            return arr.get(k)
        if isinstance(arr, (list, tuple)) and len(arr) == nk and nk != nk - ni:
            return get(arr, k)
        return get(arr, p)

    main = d.get("a") if ltt == 1 else d.get("angtable") if ltt == 2 else None
    for p, (key, ak) in enumerate(items(main), 1):
        k = key if isinstance(main, dict) else ni + p
        nbt, ints = interp(pick(d.get("E_interpol"), k, p))
        idx = items(ak)
        elaw = laws(nbt, ints, len(idx))
        Ek = pick(E, k, p)
        pb = {**b, "photon_seq": k, "eg_ev": num(get(EG, k)), "es_ev": num(get(ESs, k))}
        for (l, x), lw in zip(idx, elaw):
            e = num(get(Ek, l))
            es.append(e)
            if ltt == 1:
                c = vals(x)
                n += t.extend({**pb, "form": "legendre", "e_seq": l, "e_ev": e, "e_interpolation": lw,
                               "l": list(range(1, len(c) + 1)), "value": c}, len(c))
            else:
                mu, pr, il = tab(x, "mu", "p")
                n += t.extend({**pb, "form": "tabulated", "e_seq": l, "e_ev": e, "e_interpolation": lw, "mu": mu,
                               "value": pr, "interpolation": il}, len(mu))
    info["energies"] = es
    return n


# ---------- MF15 ----------
def mf15_rows(T, base, d, info):
    t = T["photon_edist"]
    n = 0
    es = []
    for j, s in items(d.get("subsection")):
        lf = num(s.get("LF"), int)
        b = {**base, "subsection": j, "lf": lf}
        E, p, il = tab(s.get("rtfm_tab1") or {}, "Eint", "p")
        n += t.extend({**b, "kind": "p", "e_seq": list(range(1, len(E) + 1)), "e_in_ev": E, "value": p,
                       "interpolation": il}, len(E))
        nbt, ints = interp(s)
        idx = items(s.get("rtfm1_tab"))
        elaw = laws(nbt, ints, len(idx))
        Ek = s.get("E")
        for (k, tb), lw in zip(idx, elaw):
            eg, g, gl = tab(tb, "Egamma", "g")
            e = num(get(Ek, k))
            es.append(e)
            n += t.extend({**b, "kind": "g", "e_seq": k, "e_in_ev": e, "e_interpolation": lw, "eg_ev": eg, "value": g,
                           "interpolation": gl}, len(eg))
    info["energies"] = es
    return n


def rows_for(T, base, mf, mt, d, info):
    """Rows of one section; returns the number of numeric values written (rows with a value)."""
    if mf == 4:
        return mf4_rows(T, {**base, "mt": mt}, d, info)
    if mf == 5:
        return mf5_rows(T, {**base, "mt": mt}, d, info)
    if mf == 6:
        return mf6_rows(T, {**base, "mt": mt}, d, info)
    if mf in (9, 10):
        return mult_rows(T, {**base, "mt": mt}, d, info, mf)
    if mf in (12, 13):
        return photon_xs_rows(T, {**base, "mt": mt}, d, info, mf)
    if mf == 14:
        return mf14_rows(T, {**base, "mt": mt}, d, info)
    return mf15_rows(T, {**base, "mt": mt}, d, info)


def count_values(t, start):
    return sum(1 for v in t.cols["value"][start:] if v is not None)


def material_lines(release, mid):
    keys = sorted(k for k, _ in list_keys(f"lake/_work/endf-split/{release}/{mid}/"))
    lines = []
    for k in keys:
        txt = s3.get_object(Bucket=BUCKET, Key=k)["Body"].read().decode("latin-1")
        lines += txt.split("\n")[:-1] if txt.endswith("\n") else txt.split("\n")
    return lines, keys


def parquet_bytes(tbl):
    sink = pa.BufferOutputStream()
    pq.write_table(tbl, sink, compression="snappy", row_group_size=200_000)
    return sink.getvalue().to_pybytes()


def parse(ev, context=None):
    t0 = time.time()
    release, mid = ev["release"], ev["id"]
    chunk = ev.get("chunk")
    stem = f"{mid}.c{chunk[0]}of{chunk[1]}" if chunk else mid
    lines, keys = material_lines(release, mid)
    t_read = time.time() - t0
    base = {"release": release, "sublibrary": ev.get("sublibrary"), "file_name": ev.get("file_name"),
            "mat": ev.get("mat")}
    T = {t: Rows(s) for t, s in SCHEMAS.items()}
    sections, rejects = [], []
    by_mf = collections.Counter()
    k = -1
    for (mat, mf, mt), body, term in sections_of(lines):
        if mf not in WANT:
            continue
        k += 1
        if chunk and k % chunk[1] != chunk[0]:
            continue
        by_mf[mf] += 1
        tname = TABLE_OF_MF[mf]
        t = T[tname]
        start = t.n
        ts = time.time()
        try:
            d, squeezed = read_section(mat, mf, mt, body, term)
        except Exception as e:  # noqa: BLE001
            rejects.append({"mat": mat, "mf": mf, "mt": mt, "lines": len(body), "stage": "parse",
                            "error": f"{type(e).__name__}: {str(e)[:300]}"})
            continue
        info = {}
        try:
            rows_for(T, {**base, "mat": mat}, mf, mt, d, info)
        except Exception as e:  # noqa: BLE001  a shape the row builders do not know: drop its partial rows
            for c in t.cols.values():
                del c[start:]
            t.n = start
            rejects.append({"mat": mat, "mf": mf, "mt": mt, "lines": len(body), "stage": "rows",
                            "error": f"{type(e).__name__}: {str(e)[:300]}"})
            continue
        es = [e for e in info.pop("energies", []) if e is not None]
        sec = {"mf": mf, "mt": mt, "table": tname, "lines": len(body), "rows": t.n - start,
               "n_values": count_values(t, start), "n_e": len(es), "e_min": min(es) if es else None,
               "e_max": max(es) if es else None, "seconds": round(time.time() - ts, 3), **info}
        if squeezed:
            sec["squeezed"] = True
        sections.append(sec)
    t_parse = time.time() - t0 - t_read
    written = {}
    for tname, t in T.items():
        if t.n:
            key = f"lake/endfb/{release}/{tname}/{stem}.parquet"
            s3.put_object(Bucket=BUCKET, Key=key, Body=parquet_bytes(t.table()))
            written[tname] = t.n
    vals_by_mf = collections.Counter()
    rows_by_mf = collections.Counter()
    for s in sections:
        vals_by_mf[s["mf"]] += s["n_values"]
        rows_by_mf[s["mf"]] += s["rows"]
    rej_by_mf = collections.Counter(r["mf"] for r in rejects)
    out = {"release": release, "id": mid, "chunk": chunk, "file_name": base["file_name"],
           "sublibrary": base["sublibrary"], "mat": base["mat"], "fragments": len(keys), "lines": len(lines),
           "sections_by_mf": dict(by_mf), "parsed_by_mf": {m: by_mf[m] - rej_by_mf[m] for m in by_mf},
           "rejected_by_mf": dict(rej_by_mf), "values_by_mf": dict(vals_by_mf), "rows_by_mf": dict(rows_by_mf),
           "rows": written, "rejects": rejects, "sections": sections,
           "seconds": {"read": round(t_read, 2), "parse": round(t_parse, 2), "total": round(time.time() - t0, 2)},
           "memory_mb": int(os.environ.get("AWS_LAMBDA_FUNCTION_MEMORY_SIZE", "0")), "at": now()}
    put_json(f"lake/endfb/{release}/mf4_15/sections/{stem}.json", out)
    return {k: out[k] for k in ("id", "lines", "sections_by_mf", "values_by_mf", "rows", "seconds")} | \
        {"rejects": len(rejects), "first_rejects": rejects[:5]}


# ---------- probe ----------
def shape(v, depth=0):
    if depth > 5:
        return "…"
    if isinstance(v, dict):
        ks = sorted(v.keys(), key=str)
        if ks and all(isinstance(k, int) for k in ks):
            return {"dict[int]": f"{ks[0]}..{ks[-1]} ({len(ks)})", "first": shape(v[ks[0]], depth + 1)}
        return {str(k): shape(v[k], depth + 1) for k in ks}
    if isinstance(v, (list, tuple)):
        return {"list": len(v), "first": shape(v[0], depth + 1) if v else None}
    return type(v).__name__ + ":" + str(v)[:20]


def probe(ev):
    lines, _ = material_lines(ev["release"], ev["id"])
    out, seen = [], collections.Counter()
    for (mat, mf, mt), body, term in sections_of(lines):
        if mf != ev.get("mf") or seen[mf] >= ev.get("limit", 2) or (ev.get("mt") and mt != ev["mt"]):
            continue
        seen[mf] += 1
        try:
            d, _ = read_section(mat, mf, mt, body, term)
            out.append({"mat": mat, "mf": mf, "mt": mt, "shape": shape(d)})
        except Exception as e:  # noqa: BLE001
            out.append({"mat": mat, "mf": mf, "mt": mt, "error": str(e)[:300]})
    return out


# ---------- fan-out ----------
def invoke_all(events):
    def one(e):
        lam.invoke(FunctionName=FN, InvocationType="Event", Payload=json.dumps(e).encode())
    with cf.ThreadPoolExecutor(48) as pool:
        list(pool.map(one, events))
    return len(events)


def split_index(release):
    """Every material in the release's split indexes: runs merged by id, lines and lines by MF summed."""
    keys = [k for k, _ in list_keys(f"lake/_work/endf-split/{release}/_index/")]
    with cf.ThreadPoolExecutor(32) as pool:
        parts = list(pool.map(get_json, keys))
    mats = {}
    for p in parts:
        for r in p["runs"]:
            m = mats.setdefault(r["id"], {"id": r["id"], "file_name": r["file_name"], "sublibrary": r["sublibrary"],
                                          "mat": r["mat"], "lines": 0, "by_mf": collections.Counter(), "runs": 0})
            m["lines"] += r["lines"]
            m["runs"] += 1
            m["by_mf"].update({int(k): v for k, v in r["by_mf"].items()})
    return mats, parts


def fanout(ev):
    release, stage = ev["release"], ev["stage"]
    if stage == "split":
        parts = [k.rsplit("/", 1)[-1] for k, _ in list_keys(f"lake/endfb/{release}/records/") if k.endswith(".parquet")]
        return {"invoked": invoke_all([{"job": "split", "release": release, "part": p} for p in parts]),
                "parts": len(parts)}
    mats, parts = split_index(release)
    todo = sorted(mats.values(), key=lambda m: -m["lines"])
    if ev.get("ids"):
        todo = [m for m in todo if m["id"] in set(ev["ids"])]
    if ev.get("missing"):
        done = {k.rsplit("/", 1)[-1].rsplit(".json", 1)[0].split(".c")[0]
                for k, _ in list_keys(f"lake/endfb/{release}/mf4_15/sections/")}
        todo = [m for m in todo if m["id"] not in done]
    if ev.get("rejected"):  # again, the materials whose summary lists a rejected section
        keys = [k for k, _ in list_keys(f"lake/endfb/{release}/mf4_15/sections/")]
        with cf.ThreadPoolExecutor(64) as pool:
            bad = {s["id"] for s in pool.map(get_json, keys) if s["rejects"]}
        todo = [m for m in todo if m["id"] in bad]
    n = ev.get("chunks")
    events = []
    for m in todo:
        e = {"job": "parse", "release": release, "id": m["id"], "file_name": m["file_name"],
             "sublibrary": m["sublibrary"], "mat": m["mat"]}
        if n:
            events += [{**e, "chunk": [i, n]} for i in range(n)]
        else:
            events.append(e)
    return {"invoked": invoke_all(events), "materials": len(todo), "parts": len(parts),
            "lines": sum(m["lines"] for m in todo), "longest": [(m["id"], m["lines"]) for m in todo[:5]]}


# ---------- collect: register, count, manifest ----------
athena = boto3.client("athena", region_name=REGION)


def athena_query(sql):
    qid = athena.start_query_execution(QueryString=sql, QueryExecutionContext={"Database": DATABASE},
                                       WorkGroup=WORKGROUP)["QueryExecutionId"]
    while True:
        e = athena.get_query_execution(QueryExecutionId=qid)["QueryExecution"]
        st = e["Status"]["State"]
        if st in ("SUCCEEDED", "FAILED", "CANCELLED"):
            break
        time.sleep(1)
    if st != "SUCCEEDED":
        raise RuntimeError(f"{st}: {e['Status'].get('StateChangeReason')}\n{sql}")
    res = athena.get_query_results(QueryExecutionId=qid)["ResultSet"]["Rows"]
    return [[c.get("VarCharValue") for c in r["Data"]] for r in res[1:]], e.get("Statistics", {}).get("DataScannedInBytes", 0)


def ddl(name, schema):
    cols = ",\n  ".join(f"`{f.name}` {ATHENA_TYPE[f.type]}" for f in schema if f.name != "release")
    return (f"CREATE EXTERNAL TABLE IF NOT EXISTS `{name}` (\n  {cols}\n)\nPARTITIONED BY (`release` string)\n"
            f"STORED AS PARQUET\nLOCATION 's3://{BUCKET}/lake/endfb/'\nTBLPROPERTIES ('parquet.compression'='SNAPPY')")


def collect(ev):
    t0 = time.time()
    release = ev["release"]
    mats, parts = split_index(release)
    keys = [k for k, _ in list_keys(f"lake/endfb/{release}/mf4_15/sections/")]
    with cf.ThreadPoolExecutor(64) as pool:
        sums = list(pool.map(get_json, keys))
    done_ids = {s["id"] for s in sums}
    missing = sorted(set(mats) - done_ids)
    agg = {k: collections.Counter() for k in ("sections_by_mf", "parsed_by_mf", "rejected_by_mf", "values_by_mf",
                                               "rows_by_mf")}
    rows = collections.Counter()
    rejects, secs, materials = [], [], {}
    by_mt = collections.defaultdict(collections.Counter)
    for s in sums:
        for k in agg:
            agg[k].update({int(m): v for m, v in s[k].items()})
        rows.update(s["rows"])
        for r in s["rejects"]:
            rejects.append({"file_name": s["file_name"], "mat": r["mat"], "mf": r["mf"], "mt": r["mt"],
                            "stage": r["stage"], "error": r["error"]})
        secs.append(s["seconds"]["total"])
        m = materials.setdefault(s["id"], {"id": s["id"], "file_name": s["file_name"], "sublibrary": s["sublibrary"],
                                           "mat": s["mat"], "mfs": set(), "values": 0})
        m["mfs"].update(int(x) for x in s["sections_by_mf"])
        m["values"] += sum(s["values_by_mf"].values())
        for sec in s["sections"]:
            by_mt[sec["mf"]][sec["mt"]] += sec["n_values"]
    for m in materials.values():
        m["mfs"] = sorted(m["mfs"])
    scanned = queries = 0
    tables = {}
    for t, schema in SCHEMAS.items():
        name = f"endfb_{t}"
        athena_query(ddl(name, schema))
        athena_query(f"ALTER TABLE `{name}` ADD IF NOT EXISTS PARTITION (release='{release}') "
                     f"LOCATION 's3://{BUCKET}/lake/endfb/{release}/{t}/'")
        (r,), sc = athena_query(f"SELECT count(*), count(value) FROM {name} WHERE release = '{release}'")
        queries += 3
        scanned += sc
        tables[name] = {"location": f"s3://{BUCKET}/lake/endfb/{release}/{t}/", "partition": {"release": release},
                        "rows_written": rows.get(t, 0), "athena_count": int(r[0]), "athena_values": int(r[1]),
                        "match": int(r[0]) == rows.get(t, 0),
                        "columns": [f"{f.name} {ATHENA_TYPE[f.type]}" for f in schema]}
    res, sc = athena_query(f"SELECT mf, count(*) FROM endfb_sections WHERE release = '{release}' AND mf IN "
                           f"({', '.join(map(str, WANT))}) GROUP BY mf")
    queries += 1
    scanned += sc
    in_sections = {int(a): int(b) for a, b in res}
    check = {}
    explained = []
    for mf in WANT:
        c = {"endfb_sections": in_sections.get(mf, 0), "sections_met": agg["sections_by_mf"].get(mf, 0),
             "parsed": agg["parsed_by_mf"].get(mf, 0), "rejected": agg["rejected_by_mf"].get(mf, 0),
             "values": agg["values_by_mf"].get(mf, 0)}
        c["match"] = c["endfb_sections"] == c["parsed"]
        check[mf] = c
        if c["endfb_sections"] != c["sections_met"]:
            explained.append(f"MF{mf}: endfb_sections holds {c['endfb_sections']:,} sections, this pass met "
                             f"{c['sections_met']:,}" + (f" ({len(missing)} materials have no summary yet)" if missing else "") + ".")
        if c["rejected"]:
            ex = [r for r in rejects if r["mf"] == mf][:3]
            explained.append(f"MF{mf}: endf-parserpy rejected {c['rejected']:,} sections (rejects.json lists each with its "
                             f"file, MAT, MT and error; their lines stay in endfb_records), e.g. "
                             + "; ".join(f"{r['file_name'].rsplit('/', 1)[-1]} MAT {r['mat']} MT {r['mt']}: "
                                         f"{r['error'][:80]}" for r in ex) + ".")
    put_json(f"lake/endfb/{release}/mf4_15/materials.json",
             sorted(materials.values(), key=lambda m: (m["sublibrary"] or "", m["mat"] or 0)))
    put_json(f"lake/endfb/{release}/mf4_15/rejects.json", rejects)
    split_s = [p["seconds"] for p in parts]
    gbs = sum(secs) * int(os.environ.get("AWS_LAMBDA_FUNCTION_MEMORY_SIZE", "3008")) / 1024
    local = {"release": release, "built_at": now(), "parser": "endf-parserpy 0.18.0 (EndfParserPy, array_type=list)",
             "script": "services/nsr-endf-parse/lambda_function.py",
             "source": {"records_parts": len(parts), "materials_with_mf4_15": len(mats), "summaries": len(sums),
                        "missing": missing[:200], "missing_count": len(missing)},
             "sections_by_mf": dict(sorted(agg["sections_by_mf"].items())),
             "values_by_mf": dict(sorted(agg["values_by_mf"].items())),
             "parsed_by_mf": dict(sorted(agg["parsed_by_mf"].items())),
             "rejected_by_mf": dict(sorted(agg["rejected_by_mf"].items())),
             "rows_by_mf": dict(sorted(agg["rows_by_mf"].items())),
             "total_values": sum(agg["values_by_mf"].values()),
             "values_by_mf_mt": {mf: dict(sorted(c.items())) for mf, c in sorted(by_mt.items())},
             "rejected": len(rejects), "rejects_first": rejects[:300],
             "rejects_key": f"lake/endfb/{release}/mf4_15/rejects.json",
             "counts_check": {"tables_vs_sections": check, "explained": explained},
             "tables": tables,
             "timings": {"split_parts": len(split_s), "split_seconds_max": max(split_s) if split_s else None,
                         "split_seconds_sum": round(sum(split_s), 1), "parse_invocations": len(sums),
                         "parse_seconds_sum": round(sum(secs), 1), "parse_seconds_max": max(secs) if secs else None,
                         "first_summary": min((s["at"] for s in sums), default=None),
                         "last_summary": max((s["at"] for s in sums), default=None)},
             "spend": {"lambda_gb_seconds_parse": round(gbs), "lambda_usd_parse": round(gbs * 0.0000166667, 2),
                       "athena_queries": queries, "athena_bytes_scanned": scanned,
                       "athena_usd": round(max(scanned, queries * 10_485_760) / 1e12 * 5, 4)},
             "collect_seconds": round(time.time() - t0, 1)}
    key = f"lake/endfb/{release}/manifest.json"
    try:
        manifest = get_json(key)
    except Exception:  # noqa: BLE001
        manifest = {"dataset": "endfb", "release": release}
    manifest["mf4_15"] = local
    put_json(key, manifest)
    return {k: local[k] for k in ("source", "sections_by_mf", "values_by_mf", "total_values", "rejected", "timings",
                                  "spend")} | {"rows": {t: v["athena_count"] for t, v in tables.items()},
                                               "check": check, "explained": explained}


# ---------- values: every numeric value held in the endfb_* tables, for /counts ----------
# The columns that hold a value (abscissas such as energies and indices are not values). Tables of one value a row count
# that column; the others count each value column; JSON columns (params, widths) are not counted.
VALUE_COLUMNS = {
    "endfb_xs_points": ["xs_barn"],
    "endfb_fy": ["yield", "yield_unc"],
    "endfb_decay": ["half_life_s", "half_life_unc", "spin", "parity", "mean_light_ev", "mean_light_unc", "mean_em_ev",
                    "mean_em_unc", "mean_heavy_ev", "mean_heavy_unc"],
    "endfb_decay_modes": ["q_ev", "q_unc", "br", "br_unc"],
    "endfb_decay_lines": ["er_ev", "er_unc", "ri", "ri_unc", "ris", "ris_unc", "ricc", "ricc_unc", "rick", "rick_unc",
                          "ricl", "ricl_unc"],
    "endfb_cov": ["value"],
    "endfb_res_ranges": ["el_ev", "eh_ev", "spi", "ap", "abn"],
    "endfb_res_params": ["er_ev", "j", "gt_ev", "gn_ev", "gg_ev", "gf_ev", "gfa_ev", "gfb_ev", "gx_ev", "es_ev", "d_ev",
                         "amun", "amux", "amug", "amuf", "gn0_ev"],
    "endfb_res_cov": ["value"],
}
RELEASES = ["B-VIII.1", "B-VIII.0", "B-VII.1", "B-VII.0", "B-VI.8", "B-V", "B-IV", "B-III", "B-II", "CENDL-3.2",
            "JEFF-3.3", "JENDL-5", "TENDL-2023"]


def values(ev):
    t0 = time.time()
    out, by_release, scanned = [], collections.Counter(), 0
    for table, cols in VALUE_COLUMNS.items():
        rows, sc = athena_query(f"SELECT release, {', '.join(f'count({c})' for c in cols)} FROM {table} GROUP BY release")
        scanned += sc
        per = {r[0]: [int(x) for x in r[1:]] for r in rows}
        n = sum(sum(v) for v in per.values())
        out.append({"table": table, "columns": cols, "values": n,
                    "by_column": {c: sum(v[i] for v in per.values()) for i, c in enumerate(cols)},
                    "by_release": {r: sum(v) for r, v in sorted(per.items())}, "source": "Athena count(column)"})
        for r, v in per.items():
            by_release[r] += sum(v)
    new = collections.defaultdict(dict)
    for r in RELEASES:
        try:
            m = get_json(f"lake/endfb/{r}/manifest.json").get("mf4_15") or {}
        except Exception:  # noqa: BLE001
            m = {}
        for name, t in (m.get("tables") or {}).items():
            new[name][r] = t.get("athena_values", 0)
    for name in sorted(new, key=lambda n: list(SCHEMAS).index(n[6:]) if n[6:] in SCHEMAS else 99):
        n = sum(new[name].values())
        out.append({"table": name, "columns": ["value"], "values": n, "by_release": dict(new[name]),
                    "source": "manifest mf4_15 (Athena count(value) at collect)"})
        for r, v in new[name].items():
            by_release[r] += v
    body = {"counted_at": now(), "total_values": sum(x["values"] for x in out),
            "total_values_of": [f"{x['table']}.{c}" for x in out for c in x["columns"]], "tables": out,
            "by_release": dict(sorted(by_release.items())),
            "note": "every non-null numeric value of the endfb_* tables: cross-section points (xs_barn), yields, decay "
                    "data, resonance and covariance parameters, and Files 4-15 (brief 64); energies, indices and JSON "
                    "columns are not counted. endfb_xs_points includes the POINT releases.",
            "athena_bytes_scanned": scanned, "seconds": round(time.time() - t0, 1)}

    def size(prefix):
        ks = list_keys(prefix)
        return len(ks), sum(s for _, s in ks)
    jobs = {(r, t): f"lake/endfb/{r}/{t}/" for r in RELEASES for t in list(SCHEMAS) + ["mf4_15"]}
    with cf.ThreadPoolExecutor(32) as pool:
        got = dict(zip(jobs, pool.map(size, jobs.values())))
        split_files, split_bytes = pool.submit(size, "lake/_work/endf-split/").result()
    body["storage"] = {t: {"files": sum(got[(r, t)][0] for r in RELEASES), "bytes": sum(got[(r, t)][1] for r in RELEASES)}
                       for t in list(SCHEMAS) + ["mf4_15"]}
    body["storage"]["_work/endf-split"] = {"files": split_files, "bytes": split_bytes}
    put_json("lake/endfb/_values/latest.json", body)
    return {k: body[k] for k in ("total_values", "by_release", "seconds", "storage")} | {"tables": {x["table"]: x["values"] for x in out}}


def clean(ev):
    """Delete the split text (Part A rebuilds it in about a minute a release); the split indexes stay for collect."""
    n = 0
    for r in ([ev["release"]] if ev.get("release") else RELEASES):
        keys = [k for k, _ in list_keys(f"lake/_work/endf-split/{r}/") if "/_index/" not in k]
        for i in range(0, len(keys), 1000):
            s3.delete_objects(Bucket=BUCKET, Delete={"Objects": [{"Key": k} for k in keys[i:i + 1000]], "Quiet": True})
        n += len(keys)
        try:  # record it in the manifest
            key = f"lake/endfb/{r}/manifest.json"
            m = get_json(key)
            if "mf4_15" in m:
                m["mf4_15"]["split_text"] = {"deleted_at": now(), "prefix": f"lake/_work/endf-split/{r}/",
                                             "note": "the per-material text of MF 4-15 was deleted after the run (130 GB "
                                                     "for all 13 releases); the split indexes stay, and Part A "
                                                     "(fanout stage split) rebuilds the text in about a minute"}
                put_json(key, m)
        except Exception:  # noqa: BLE001
            pass
    return {"deleted": n}


def lambda_handler(event, context=None):
    job = event.get("job")
    if job == "split":
        return split(event)
    if job == "parse":
        return parse(event, context)
    if job == "fanout":
        return fanout(event)
    if job == "collect":
        return collect(event)
    if job == "probe":
        return probe(event)
    if job == "values":
        return values(event)
    if job == "clean":
        return clean(event)
    if job == "lines":  # a material's lines by MF, for checks
        lines, keys = material_lines(event["release"], event["id"])
        return {"lines": len(lines), "keys": keys}
    return {"error": f"unknown job {job!r}"}
